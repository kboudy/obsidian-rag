# `frontend/StreamingResponse.tsx` — Streaming Answer Renderer

[View source](../../frontend/StreamingResponse.tsx)

## Purpose

Renders the LLM's answer as it streams in, with a blinking cursor while generation is in progress. Includes a minimal inline Markdown renderer for bold, inline code, and fenced code blocks.

## Props

```ts
interface Props {
  text: string;     // accumulated text so far
  streaming: boolean; // true while LLM is still generating
}
```

## Blinking cursor

```tsx
{streaming && <span className="cursor" />}
```

The `cursor` class in `styles.css` is a 2px-wide element with a CSS blink animation:

```css
.cursor {
  display: inline-block;
  width: 2px;
  height: 1em;
  background: var(--accent);
  animation: blink 1s step-end infinite;
}
@keyframes blink { 50% { opacity: 0; } }
```

## Markdown renderer

A lightweight inline renderer handles the most common patterns in LLM output, avoiding a full Markdown library dependency.

### Block-level: `renderMarkdown(text)`

Iterates lines with a `while` loop (not `map`) to allow multi-line code blocks:

```ts
if (line.trimStart().startsWith("```")) {
  // collect lines until closing ```
  // emit <pre><code>...</code></pre>
}
// otherwise: <p>{renderInline(line)}</p>
```

### Inline: `renderInline(text)`

A single regex `/(\*\*(.+?)\*\*|`([^`]+)`)/g` matches either `**bold**` or `` `code` `` and emits the appropriate React element (`<strong>` or `<code>`). Text between matches is emitted as plain strings.

### Why not use a library?

The renderer only needs to handle LLM output, which is structured and predictable. A full Markdown parser (like `marked` or `react-markdown`) would add bundle weight for features like tables and HTML passthrough that aren't needed here.
