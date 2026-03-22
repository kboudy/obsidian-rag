# `src/ingestion/embedder.ts` — Chunk Embedder

[View source](../../../src/ingestion/embedder.ts)

## Purpose

Converts `Chunk[]` into `ChunkWithEmbedding[]` by calling the Ollama embedding API. Also provides `embedQuery()` for embedding user queries at search time.

## Task-specific prefixes

`nomic-embed-text` is a [Matryoshka embedding model](https://huggingface.co/nomic-ai/nomic-embed-text-v1.5) trained with task-specific prefixes. Using the correct prefix significantly improves retrieval quality:

```ts
const DOCUMENT_PREFIX = "search_document: ";
const QUERY_PREFIX    = "search_query: ";
```

- Documents indexed into the vector DB get `"search_document: "` prepended to their `contentClean`
- Queries at search time get `"search_query: "` prepended via `embedQuery()`

**This asymmetry is intentional.** The model was fine-tuned to understand that a `search_document` embedding should be retrievable by a `search_query` embedding, even though they describe the same concept differently.

## `embedChunks(chunks): Promise<ChunkWithEmbedding[]>`

```ts
export interface ChunkWithEmbedding extends Chunk {
  embedding: number[];  // 768-element float array
}
```

Process:
1. Map each chunk's `contentClean` → prepend `DOCUMENT_PREFIX`
2. Call `ollama.embed(texts)` — batched 50 at a time internally
3. Zip embeddings back onto chunks by index

```ts
const texts = chunks.map(c => DOCUMENT_PREFIX + c.contentClean);
const embeddings = await embed(texts);
return chunks.map((chunk, i) => ({ ...chunk, embedding: embeddings[i]! }));
```

## `embedQuery(query): Promise<number[]>`

Used at query time by `src/query/search.ts`. Wraps the single-query case:

```ts
const embeddings = await embed([QUERY_PREFIX + query]);
return embeddings[0]!;
```

The `!` non-null assertion is safe because we always pass exactly one text and get exactly one embedding back.
