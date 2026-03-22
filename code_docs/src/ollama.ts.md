# `src/ollama.ts` — Ollama HTTP Client

[View source](../../src/ollama.ts)

## Purpose

Low-level HTTP client for the Ollama daemon. Provides three functions: `embed`, `chat`, and `checkHealth`. All network calls use the native `fetch` API — no third-party Ollama SDK.

## `embed(texts: string[]): Promise<number[][]>`

Sends texts to Ollama's batch embedding endpoint and returns a 2D array of float vectors.

```ts
const embeddings = await embed(["hello world", "git rebase tutorial"]);
// embeddings[0] = [0.012, -0.045, ...] // 768 floats
// embeddings[1] = [-0.003, 0.091, ...]
```

### Batching

Requests are chunked into groups of 50 (`EMBED_BATCH_SIZE`) to avoid overwhelming Ollama:

```ts
for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
  const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
  const response = await fetch(`${ollamaUrl}/api/embed`, {
    body: JSON.stringify({ model: "nomic-embed-text", input: batch }),
  });
  // ...
}
```

### API endpoint

`POST /api/embed` (not `/api/embeddings` — that's the legacy single-text endpoint).

Request:
```json
{ "model": "nomic-embed-text", "input": ["text1", "text2"] }
```

Response:
```json
{ "embeddings": [[0.01, -0.04, ...], [-0.003, 0.09, ...]] }
```

## `chat(messages): AsyncGenerator<string>`

Streams a chat completion from Ollama. Returns an async generator that yields text fragments as they arrive.

```ts
for await (const fragment of chat([{ role: "user", content: "What is git rebase?" }])) {
  process.stdout.write(fragment);
}
```

### Streaming protocol

Ollama streams responses as newline-delimited JSON (NDJSON). Each line is a JSON object:

```json
{ "message": { "role": "assistant", "content": "Git rebase is..." }, "done": false }
{ "message": { "role": "assistant", "content": " a way to..." }, "done": false }
{ "done": true }
```

The function reads the `ReadableStream` byte-by-byte, accumulates into a buffer, splits on newlines, and yields `chunk.message.content` for each parsed line:

```ts
const reader = response.body!.getReader();
const decoder = new TextDecoder();
let buffer = "";

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? ""; // keep incomplete last line
  for (const line of lines) {
    const chunk = JSON.parse(line);
    if (chunk.message?.content) yield chunk.message.content;
  }
}
```

The `buffer = lines.pop()` trick handles the case where a network chunk cuts through the middle of a JSON line.

## `checkHealth(): Promise<boolean>`

Simple liveness check — GETs the Ollama root endpoint with a 3-second timeout. Returns `true` if reachable, `false` otherwise. Used by `GET /api/status`.

```ts
const response = await fetch(`${ollamaUrl}/`, { signal: AbortSignal.timeout(3000) });
return response.ok;
```
