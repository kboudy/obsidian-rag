# `src/db/chunks.ts` — Chunks Table CRUD & Vector Search

[View source](../../../src/db/chunks.ts)

## Purpose

All database operations for the `chunks` table, including the core vector similarity search that powers retrieval.

## Types

```ts
interface ChunkInsert {
  document_id: number;
  chunk_index: number;
  heading_path: string;
  content: string;       // raw markdown (for display)
  content_clean: string; // wikilinks stripped (was used for embedding)
  token_count: number;
  embedding: number[];   // 768-element float array
}

interface ChunkSearchResult {
  chunk_id: number;
  content: string;
  heading_path: string;
  file_path: string;
  file_name: string;
  tags: string[];
  similarity: number;    // cosine similarity [0, 1]
}
```

## Functions

### `insertChunks(chunks)`

Inserts an array of chunks one at a time. The vector casting is the notable part:

```ts
const embeddingStr = `[${chunk.embedding.join(",")}]`;
await sql`
  INSERT INTO chunks (..., embedding)
  VALUES (..., ${embeddingStr}::vector)
`;
```

pgvector expects the vector as a PostgreSQL literal in the format `[0.1, 0.2, ...]`. Bun's SQL driver doesn't natively understand the `vector` type, so the float array is serialized to this string format and cast with `::vector` in the SQL itself.

### `deleteChunksByDocument(documentId)`

Deletes all chunks for a given document. Called before re-inserting during re-indexing to avoid duplicates.

### `vectorSearch(embedding, topK)`

The heart of the retrieval system. Given a query embedding, finds the `topK` most similar chunks using pgvector's `<=>` cosine distance operator:

```sql
SELECT
  c.id AS chunk_id,
  c.content,
  c.heading_path,
  d.file_path,
  d.file_name,
  d.tags,
  1 - (c.embedding <=> '[...]'::vector) AS similarity
FROM chunks c
JOIN documents d ON c.document_id = d.id
ORDER BY c.embedding <=> '[...]'::vector
LIMIT 20
```

Key details:
- **`<=>`** is pgvector's cosine distance operator. Distance is in [0, 2] where 0 = identical vectors.
- **`1 - distance`** converts distance to similarity in [0, 1] where 1 = identical.
- The `ORDER BY` uses the raw distance (not the derived similarity) so pgvector can use the HNSW index efficiently.
- The JOIN fetches document metadata in a single query — no N+1.

### `getChunkCount()`

Returns the total number of chunks across all documents. Used by `GET /api/status`.
