# `src/server.ts` — HTTP Server

[View source](../../src/server.ts)

## Purpose

Defines all HTTP routes and starts the Bun server. Serves the React SPA via HTML import and exposes the RAG API.

## `startServer()`

Creates the server with `Bun.serve()`:

```ts
Bun.serve({
  port: config.port,
  routes: {
    "/":               index,            // React SPA (HTML import)
    "/api/query":      { POST: handleQuery },
    "/api/index":      { POST: handleReindex },
    "/api/status":     { GET:  handleStatus },
    "/api/documents":  { GET:  handleListDocuments },
  },
  development: process.env.NODE_ENV !== "production"
    ? { hmr: true, console: true }
    : undefined,
});
```

`import index from "../index.html"` is a Bun-specific HTML import. Bun's bundler automatically bundles the React TSX, CSS, and all imports referenced by `index.html` and serves the result at `/`.

## Routes

### `POST /api/query` — SSE streaming

The primary endpoint. Accepts `{ query: string }` JSON and returns a Server-Sent Events stream.

```ts
const stream = new ReadableStream({
  async start(controller) {
    const encoder = new TextEncoder();
    for await (const event of queryPipeline(query)) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
    }
    controller.close();
  },
});

return new Response(stream, {
  headers: {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  },
});
```

Each SSE message is `data: <JSON>\n\n`. The `QueryEvent` union type from `src/query/pipeline.ts` defines what the JSON can contain (`sources`, `chunk`, `done`, `error`).

### `POST /api/index` — Manual re-index

Triggers `indexVault()` and returns the `IndexResult` as JSON. Accepts an optional `{ force: true }` body to skip hash-based change detection and re-embed everything.

### `GET /api/status` — Health check

Returns a JSON snapshot of system state, useful for monitoring:

```json
{
  "ollama": "ok",
  "documents": 212,
  "chunks": 1038,
  "lastIndexed": "2026-03-22T12:34:56.000Z"
}
```

`lastIndexed` is derived from the `MAX(indexed_at)` across all document rows.

### `GET /api/documents` — Document list

Returns the full `documents` table as a JSON array. Intended for debugging or building future UI features (e.g., a file browser).

## Input validation

`handleQuery` validates the request body before starting the pipeline:

```ts
const body = (await req.json()) as { query?: unknown };
if (typeof body.query !== "string" || !body.query.trim()) {
  return new Response(JSON.stringify({ error: "query must be a non-empty string" }), {
    status: 400,
  });
}
```
