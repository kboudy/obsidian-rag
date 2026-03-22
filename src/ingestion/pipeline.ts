import { scanVault } from "./scanner.ts";
import { parseMarkdown } from "./parser.ts";
import { chunkSections } from "./chunker.ts";
import { embedChunks } from "./embedder.ts";
import { upsertDocument, deleteDocument, getAllDocumentPaths, getDocumentByPath } from "../db/documents.ts";
import { insertChunks, deleteChunksByDocument } from "../db/chunks.ts";
import { sql } from "../db/connection.ts";
import { config } from "../config.ts";

export interface IndexResult {
  added: number;
  updated: number;
  deleted: number;
  skipped: number;
  totalChunks: number;
  durationMs: number;
}

function hashContent(content: string): string {
  return new Bun.CryptoHasher("sha256").update(content).digest("hex");
}

export async function indexVault(options: { force?: boolean; verbose?: boolean } = {}): Promise<IndexResult> {
  const start = Date.now();
  const result: IndexResult = { added: 0, updated: 0, deleted: 0, skipped: 0, totalChunks: 0, durationMs: 0 };

  const files = await scanVault();
  const filePathSet = new Set(files.map(f => f.relativePath));

  // Handle deletions: remove DB records for files no longer on disk
  const dbPaths = await getAllDocumentPaths();
  for (const dbPath of dbPaths) {
    if (!filePathSet.has(dbPath)) {
      const doc = await getDocumentByPath(dbPath);
      if (doc) {
        await deleteDocument(doc.id);
        result.deleted++;
        if (options.verbose) console.log(`  deleted: ${dbPath}`);
      }
    }
  }

  // Index each file
  for (const file of files) {
    const content = await Bun.file(file.absolutePath).text();
    const hash = hashContent(content);

    // Check if unchanged
    if (!options.force) {
      const existing = await getDocumentByPath(file.relativePath);
      if (existing && existing.content_hash === hash) {
        result.skipped++;
        continue;
      }
    }

    const isNew = !(await getDocumentByPath(file.relativePath));
    if (options.verbose) console.log(`  ${isNew ? "adding" : "updating"}: ${file.relativePath}`);

    // Parse and chunk
    const parsed = parseMarkdown(content, file.relativePath);
    const chunks = chunkSections(parsed.sections, config.chunkTargetTokens, config.chunkOverlapTokens);

    if (chunks.length === 0) {
      if (options.verbose) console.log(`    skipped (no content): ${file.relativePath}`);
      result.skipped++;
      continue;
    }

    // Embed all chunks
    const chunksWithEmbeddings = await embedChunks(chunks);

    // Upsert in a transaction: delete old chunks, upsert document, insert new chunks
    await sql.begin(async tx => {
      const fileName = file.relativePath.split("/").pop() ?? file.relativePath;
      const docId = await upsertDocument({
        file_path: file.relativePath,
        file_name: fileName,
        content_hash: hash,
        mtime: file.mtime,
        tags: parsed.tags,
      });

      await deleteChunksByDocument(docId);

      await insertChunks(chunksWithEmbeddings.map(c => ({
        document_id: docId,
        chunk_index: c.chunkIndex,
        heading_path: c.headingPath,
        content: c.content,
        content_clean: c.contentClean,
        token_count: c.tokenCount,
        embedding: c.embedding,
      })));

      result.totalChunks += chunksWithEmbeddings.length;
    });

    if (isNew) result.added++;
    else result.updated++;
  }

  result.durationMs = Date.now() - start;
  return result;
}

export async function reindexFile(relativePath: string, vaultPath: string = config.vaultPath): Promise<void> {
  const absolutePath = `${vaultPath}/${relativePath}`;
  const file = Bun.file(absolutePath);

  // Check if file was deleted
  if (!(await file.exists())) {
    const doc = await getDocumentByPath(relativePath);
    if (doc) await deleteDocument(doc.id);
    return;
  }

  const content = await file.text();
  const hash = hashContent(content);

  // Skip if unchanged
  const existing = await getDocumentByPath(relativePath);
  if (existing && existing.content_hash === hash) return;

  const parsed = parseMarkdown(content, relativePath);
  const chunks = chunkSections(parsed.sections, config.chunkTargetTokens, config.chunkOverlapTokens);
  if (chunks.length === 0) return;

  const chunksWithEmbeddings = await embedChunks(chunks);

  await sql.begin(async tx => {
    const fileName = relativePath.split("/").pop() ?? relativePath;
    const docId = await upsertDocument({
      file_path: relativePath,
      file_name: fileName,
      content_hash: hash,
      mtime: new Date(file.lastModified),
      tags: parsed.tags,
    });

    await deleteChunksByDocument(docId);

    await insertChunks(chunksWithEmbeddings.map(c => ({
      document_id: docId,
      chunk_index: c.chunkIndex,
      heading_path: c.headingPath,
      content: c.content,
      content_clean: c.contentClean,
      token_count: c.tokenCount,
      embedding: c.embedding,
    })));
  });
}
