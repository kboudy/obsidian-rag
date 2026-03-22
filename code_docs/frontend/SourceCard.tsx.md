# `frontend/SourceCard.tsx` — Source Chunk Card

[View source](../../frontend/SourceCard.tsx)

## Purpose

Renders a single source chunk returned by the reranker. Displayed in a grid below the search bar while the answer is streaming.

## Props

```ts
{ source: SourceInfo }

// SourceInfo from src/query/pipeline.ts:
// {
//   fileName: string;
//   filePath: string;
//   headingPath: string;
//   relevanceScore: number;  // 0–1 from Cohere (or cosine similarity as fallback)
//   preview: string;         // first 300 chars of chunk, single line
//   tags: string[];
// }
```

## Relevance score colouring

The badge colour provides a quick visual signal of how relevant the source is:

```ts
function scoreClass(score: number): string {
  if (score >= 0.7) return "score-high";  // green
  if (score >= 0.4) return "score-mid";   // yellow
  return "score-low";                     // red
}
```

The score is displayed as a percentage: `(score * 100).toFixed(0) + "%"`.

Note: Cohere relevance scores are not bounded to [0, 1] by the API spec, but in practice they fall in this range for well-matched results.

## Layout

```
┌─────────────────────────────────────────┐
│ bash scripting              [87%] green  │
│ .bash_profile vs .bashrc                 │
│ The difference between .bash_profile...  │
│ #bash  #linux                            │
└─────────────────────────────────────────┘
```

- File name (`.md` extension stripped) in accent blue
- Heading path (breadcrumb trail) in muted text
- Content preview truncated to 3 lines with CSS `-webkit-line-clamp`
- Tags as small coloured pill badges (only shown if tags exist)
