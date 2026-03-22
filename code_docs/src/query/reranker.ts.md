# `src/query/reranker.ts` — Cohere Reranker

[View source](../../../src/query/reranker.ts)

## Purpose

Reranks vector search results using Cohere's `rerank-v3.5` model, then returns the top-N results by relevance score. Falls back gracefully if no API key is configured.

## Why rerank?

Vector search finds chunks with similar _embeddings_, but embedding similarity and _relevance to the question_ are not the same thing. A cross-encoder reranker (like Cohere's) reads both the query and each candidate document together, producing a much more accurate relevance score at the cost of an external API call.

The pipeline retrieves `topK = 20` candidates from pgvector (a wide net), then reranks to `topN = 5` (the most relevant). Sending 20 texts to Cohere is cheap; the reranker dramatically improves which 5 appear in the LLM prompt.

## `rerank(query, results, topN?): Promise<RerankResult[]>`

```ts
interface RerankResult extends ChunkSearchResult {
  relevanceScore: number;  // Cohere relevance score, typically [0, 1]
}
```

### Happy path (Cohere API available)

```ts
const response = await fetch("https://api.cohere.com/v2/rerank", {
  method: "POST",
  headers: { "Authorization": `Bearer ${config.cohereApiKey}` },
  body: JSON.stringify({
    model: "rerank-v3.5",
    query,
    documents: results.map(r => r.content),  // send raw chunk text
    top_n: topN,
    return_documents: false,  // don't echo back the documents — we already have them
  }),
});
```

The response contains an array of `{ index, relevance_score }` objects:

```json
{
  "results": [
    { "index": 3, "relevance_score": 0.98 },
    { "index": 0, "relevance_score": 0.87 },
    ...
  ]
}
```

`index` maps back to the position in the original `results` array. The function uses this to attach `relevanceScore` to the original `ChunkSearchResult` object:

```ts
return data.results.map(item => ({
  ...results[item.index]!,
  relevanceScore: item.relevance_score,
}));
```

### Fallback (no API key or API error)

If `COHERE_API_KEY` is missing, set to the placeholder, or the API call fails for any reason, the function falls back to returning the top-N results from the vector search in their original similarity order:

```ts
return results.slice(0, topN).map(r => ({ ...r, relevanceScore: r.similarity }));
```

`r.similarity` (cosine similarity from pgvector) is used as the `relevanceScore` so the rest of the pipeline sees a consistent type. The UI will still show scores, just less accurate ones.
