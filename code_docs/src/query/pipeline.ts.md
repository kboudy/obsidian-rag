# `src/query/pipeline.ts` — Query Pipeline

[View source](../../../src/query/pipeline.ts)

## Purpose

Orchestrates the full query flow and exposes it as a typed async generator of `QueryEvent` objects. This is the only entry point the HTTP server needs to handle a user question.

## Event protocol

```ts
type QueryEvent =
  | { type: "sources"; sources: SourceInfo[] }
  | { type: "chunk";   text: string }
  | { type: "done";    fullText: string }
  | { type: "error";   message: string };
```

The pipeline emits events in this order:

1. `sources` — emitted after reranking, before LLM generation starts
2. `chunk` — emitted for each text fragment from the LLM stream (many times)
3. `done` — emitted once when the LLM stream ends, includes the complete assembled text
4. `error` — emitted if any step throws; skips remaining steps

Emitting `sources` _before_ generation allows the UI to show which notes were found while the answer is still being written — a better UX than waiting for the full response.

## `queryPipeline(query): AsyncGenerator<QueryEvent>`

```ts
export async function* queryPipeline(query: string): AsyncGenerator<QueryEvent> {
  try {
    // 1. Vector search: top-20 candidates
    const candidates = await search(query, config.searchTopK);
    if (candidates.length === 0) {
      yield { type: "error", message: "No relevant documents found." };
      return;
    }

    // 2. Rerank: top-5 most relevant
    const reranked = await rerank(query, candidates, config.rerankTopN);

    // 3. Emit sources — UI can render these immediately
    yield { type: "sources", sources: reranked.map(toSourceInfo) };

    // 4. Stream LLM answer
    let fullText = "";
    for await (const chunk of generate(query, reranked)) {
      fullText += chunk;
      yield { type: "chunk", text: chunk };
    }

    yield { type: "done", fullText };
  } catch (err) {
    yield { type: "error", message: err instanceof Error ? err.message : String(err) };
  }
}
```

## `SourceInfo` type

```ts
interface SourceInfo {
  fileName: string;
  filePath: string;
  headingPath: string;
  relevanceScore: number;
  preview: string;   // first 300 chars of content, newlines collapsed
  tags: string[];
}
```

The `preview` is a truncated, single-line version of the chunk content for display in the source card UI.

## How the server consumes it

`src/server.ts` wraps `queryPipeline` in a `ReadableStream` and formats each event as an SSE data line:

```ts
for await (const event of queryPipeline(query)) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
}
```

The frontend then reads this SSE stream and updates React state for each event type.
