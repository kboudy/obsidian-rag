import React, { useState, useRef, useCallback } from "react";
import { SourceCard } from "./SourceCard.tsx";
import { StreamingResponse } from "./StreamingResponse.tsx";
import type { SourceInfo, QueryEvent } from "../src/query/pipeline.ts";

type State =
  | { phase: "idle" }
  | { phase: "searching" }
  | { phase: "streaming"; sources: SourceInfo[]; text: string }
  | { phase: "done"; sources: SourceInfo[]; text: string }
  | { phase: "error"; message: string };

export function SearchView() {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<State>({ phase: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  const submit = useCallback(async (q: string) => {
    if (!q.trim()) return;
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    setState({ phase: "searching" });

    try {
      const response = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
        signal: abort.signal,
      });

      if (!response.ok) {
        setState({ phase: "error", message: `Server error: ${response.status}` });
        return;
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let sources: SourceInfo[] = [];
      let text = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(part.slice(6)) as QueryEvent;
            if (event.type === "sources") {
              sources = event.sources;
              setState({ phase: "streaming", sources, text: "" });
            } else if (event.type === "chunk") {
              text += event.text;
              setState({ phase: "streaming", sources, text });
            } else if (event.type === "done") {
              setState({ phase: "done", sources, text });
            } else if (event.type === "error") {
              setState({ phase: "error", message: event.message });
            }
          } catch {
            // skip malformed lines
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      setState({ phase: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submit(query);
  };

  const isLoading = state.phase === "searching" || state.phase === "streaming";

  return (
    <div>
      <div className="header">
        <h1>Obsidian RAG</h1>
        <p>Search your second brain</p>
      </div>

      <form className="search-form" onSubmit={handleSubmit}>
        <input
          className="search-input"
          type="text"
          placeholder="Ask anything about your notes…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          disabled={isLoading}
          autoFocus
        />
        <button className="search-btn" type="submit" disabled={isLoading || !query.trim()}>
          {isLoading ? "Searching…" : "Ask"}
        </button>
      </form>

      <div className="status-bar">
        {state.phase === "searching" && "Searching vault…"}
        {state.phase === "streaming" && "Generating answer…"}
        {state.phase === "done" && `Found ${state.sources.length} sources`}
      </div>

      {(state.phase === "streaming" || state.phase === "done") && state.sources.length > 0 && (
        <div className="sources-section">
          <div className="sources-heading">Sources</div>
          <div className="sources-grid">
            {state.sources.map((s, i) => <SourceCard key={i} source={s} />)}
          </div>
        </div>
      )}

      {(state.phase === "streaming" || state.phase === "done") && (
        <div className="answer-section">
          <div className="answer-heading">Answer</div>
          <StreamingResponse text={state.text} streaming={state.phase === "streaming"} />
        </div>
      )}

      {state.phase === "error" && (
        <div className="error-box">{state.message}</div>
      )}
    </div>
  );
}
