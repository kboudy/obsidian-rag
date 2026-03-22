# `src/ingestion/pipeline.ts` — Ingestion Pipeline

[View source](../../../src/ingestion/pipeline.ts)

## Purpose

Orchestrates the full document ingestion flow: scan vault → detect changes → parse → chunk → embed → store. Also provides `reindexFile()` used by the file watcher for live updates.

## `indexVault(options?): Promise<IndexResult>`

```ts
interface IndexResult {
  added: number;
  updated: number;
  deleted: number;
  skipped: number;
  totalChunks: number;
  durationMs: number;
}
```

### Full flow

```
scanVault()
  → for each deleted file: deleteDocument()
  → for each vault file:
      read content → SHA-256 hash
      if hash unchanged → skip
      parseMarkdown() → chunkSections() → embedChunks()
      sql.begin():
        upsertDocument()
        deleteChunksByDocument()
        insertChunks()
```

### Change detection

```ts
const hash = new Bun.CryptoHasher("sha256").update(content).digest("hex");
const existing = await getDocumentByPath(file.relativePath);
if (existing && existing.content_hash === hash) {
  result.skipped++;
  continue;
}
```

SHA-256 is computed on the raw file content. If it matches what's stored in the database, the file is skipped entirely — no parsing, no chunking, no embedding API calls. This makes startup fast when nothing has changed (the common case).

### Deletion handling

Before processing files, the pipeline compares the set of paths on disk against the paths in the database. Any DB path not present on disk gets deleted:

```ts
const filePathSet = new Set(files.map(f => f.relativePath));
for (const dbPath of dbPaths) {
  if (!filePathSet.has(dbPath)) {
    await deleteDocument(doc.id); // CASCADE deletes chunks too
  }
}
```

### Transactional update

Each file update wraps the DB work in a transaction to ensure consistency — if embedding succeeded but the chunk insert fails, the document record is not updated with the new hash:

```ts
await sql.begin(async tx => {
  const docId = await upsertDocument({ ... });
  await deleteChunksByDocument(docId);  // remove old chunks
  await insertChunks(chunksWithEmbeddings.map(...));
});
```

Deleting old chunks before inserting new ones (rather than using an upsert) is simpler and ensures no stale chunks remain if the new version of a file produces fewer chunks.

### Options

- `force: true` — Skip the hash check and re-embed every file. Useful if the embedding model changes.
- `verbose: true` — Log each file being added/updated/deleted. Used by `scripts/reindex.ts`.

## `reindexFile(relativePath, vaultPath?): Promise<void>`

A single-file version of the pipeline, used by `src/watcher.ts` when a vault file changes. Logic:

1. If the file no longer exists → `deleteDocument()`
2. If content hash is unchanged → return early (no-op)
3. Otherwise → parse → chunk → embed → upsert in transaction
