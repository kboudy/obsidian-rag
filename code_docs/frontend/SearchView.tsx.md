# `frontend/SearchView.tsx` — Main UI Component

[View source](../../frontend/SearchView.tsx)

## Purpose

The main (and only) page of the application. Manages a state machine for the query lifecycle, reads the SSE stream from `/api/query`, and renders the search form, source cards, and streaming answer.

## State machine

The component's state is modelled as a discriminated union with five phases:

```ts
type State =
  | { phase: "idle" }
  | { phase: "searching" }                                 // waiting for first event
  | { phase: "streaming"; sources: SourceInfo[]; text: string } // LLM is writing
  | { phase: "done";      sources: SourceInfo[]; text: string } // LLM finished
  | { phase: "error";     message: string };
```

Transitions:
```
idle
  → (submit) → searching
  → (sources event) → streaming
  → (done event) → done
  → (error) → error
```

## SSE reading

`SearchView` reads the server's SSE stream using `fetch` + `ReadableStream.getReader()` — no `EventSource` API (which doesn't support `POST` requests):

```ts
const response = await fetch("/api/query", {
  method: "POST",
  body: JSON.stringify({ query: q }),
  signal: abort.signal,
});

const reader = response.body!.getReader();
const decoder = new TextDecoder();
let buffer = "";

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const parts = buffer.split("\n\n");
  buffer = parts.pop() ?? "";  // keep incomplete last event in buffer
  for (const part of parts) {
    if (!part.startsWith("data: ")) continue;
    const event = JSON.parse(part.slice(6)) as QueryEvent;
    // handle event...
  }
}
```

The `buffer.split("\n\n")` + `parts.pop()` pattern handles SSE events that span multiple network chunks.

## Cancellation

An `AbortController` ref cancels in-flight requests when a new query is submitted before the previous one finishes:

```ts
const abortRef = useRef<AbortController | null>(null);

// On new submission:
abortRef.current?.abort();        // cancel previous
const abort = new AbortController();
abortRef.current = abort;
```

`AbortError` is caught and silently ignored since it's an expected cancellation.

## Rendering

| Phase | What's shown |
|-------|-------------|
| `idle` | Empty status bar |
| `searching` | "Searching vault…" |
| `streaming` | Source cards + streaming answer with blinking cursor |
| `done` | Source cards + complete answer |
| `error` | Red error box |

The input is disabled during `searching` and `streaming` to prevent concurrent requests.
