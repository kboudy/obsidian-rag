import { sql } from "./connection.ts";
import { config } from "../config.ts";

export interface ChunkInsert {
  document_id: number;
  chunk_index: number;
  heading_path: string;
  content: string;
  content_clean: string;
  token_count: number;
  embedding: number[];
}

export interface ChunkSearchResult {
  chunk_id: number;
  content: string;
  heading_path: string;
  file_path: string;
  file_name: string;
  tags: string[];
  similarity: number;
}

export async function insertChunks(chunks: ChunkInsert[]): Promise<void> {
  if (chunks.length === 0) return;

  // Insert one at a time to handle the vector casting cleanly
  for (const chunk of chunks) {
    const embeddingStr = `[${chunk.embedding.join(",")}]`;
    await sql`
      INSERT INTO chunks (document_id, chunk_index, heading_path, content, content_clean, token_count, embedding)
      VALUES (
        ${chunk.document_id},
        ${chunk.chunk_index},
        ${chunk.heading_path},
        ${chunk.content},
        ${chunk.content_clean},
        ${chunk.token_count},
        ${embeddingStr}::vector
      )
    `;
  }
}

export async function deleteChunksByDocument(documentId: number): Promise<void> {
  await sql`DELETE FROM chunks WHERE document_id = ${documentId}`;
}

export async function vectorSearch(embedding: number[], topK: number = config.searchTopK): Promise<ChunkSearchResult[]> {
  const embeddingStr = `[${embedding.join(",")}]`;
  const rows = await sql`
    SELECT
      c.id        AS chunk_id,
      c.content,
      c.heading_path,
      d.file_path,
      d.file_name,
      d.tags,
      1 - (c.embedding <=> ${embeddingStr}::vector) AS similarity
    FROM chunks c
    JOIN documents d ON c.document_id = d.id
    ORDER BY c.embedding <=> ${embeddingStr}::vector
    LIMIT ${topK}
  `;
  return rows as unknown as ChunkSearchResult[];
}

export async function getChunkCount(): Promise<number> {
  const [row] = await sql`SELECT COUNT(*) AS count FROM chunks`;
  return Number((row as { count: string }).count);
}
