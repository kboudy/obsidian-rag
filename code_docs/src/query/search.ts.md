# `src/query/search.ts` — Vector Search

[View source](../../../src/query/search.ts)

## Purpose

Thin orchestration layer that combines query embedding with vector search. Converts a plain-text query string into a ranked list of similar chunks.

## `search(query, topK?): Promise<ChunkSearchResult[]>`

```ts
export async function search(
  query: string,
  topK: number = config.searchTopK  // default: 20
): Promise<ChunkSearchResult[]>
```

Two steps:

1. **Embed the query** — calls `embedQuery(query)` from `src/ingestion/embedder.ts`, which prepends the `"search_query: "` task prefix before sending to Ollama
2. **Vector search** — passes the resulting 768-dim float vector to `vectorSearch()` from `src/db/chunks.ts`

```ts
const embedding = await embedQuery(query);
return vectorSearch(embedding, topK);
```

The results are ordered by cosine similarity (highest first). Each result includes the chunk content, heading path, source file metadata, and similarity score.

## Why a separate module?

`search.ts` is the single join point between the embedding system (`src/ingestion/embedder.ts`) and the database layer (`src/db/chunks.ts`). Keeping it thin makes it easy to test each layer independently and swap implementations (e.g., a different ANN backend) without touching the query pipeline.

## Result type

Re-exported from `src/db/chunks.ts` for convenience:

```ts
export type { ChunkSearchResult };
// {
//   chunk_id: number;
//   content: string;
//   heading_path: string;
//   file_path: string;
//   file_name: string;
//   tags: string[];
//   similarity: number;  // cosine similarity [0, 1]
// }
```
