# `src/ingestion/chunker.ts` — Hybrid Chunker

[View source](../../../src/ingestion/chunker.ts)

## Purpose

Splits `ParsedSection[]` into `Chunk[]` — the units that get embedded and stored. Uses a hybrid strategy: heading-based splits from the parser define natural boundaries, but sections larger than ~500 tokens are further split on paragraph boundaries with overlap.

## Output type

```ts
interface Chunk {
  chunkIndex: number;    // sequential across the whole document
  headingPath: string;   // inherited from the parent ParsedSection
  content: string;       // raw markdown (for display)
  contentClean: string;  // cleaned text (for embedding)
  tokenCount: number;    // estimated token count
}
```

## Token estimation

```ts
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
```

A simple heuristic: English text averages roughly 4 characters per BPE token. This avoids a tokenizer dependency while staying accurate enough for chunking decisions.

## `chunkSections(sections, targetTokens, overlapTokens): Chunk[]`

For each section:

- **If `tokenCount <= targetTokens`**: The section becomes a single chunk as-is.
- **If `tokenCount > targetTokens`**: The section is split further using `splitOnParagraphs` + `buildSubChunks`.

Both `content` and `contentClean` go through the same splitting logic in parallel, keeping them in sync.

## Paragraph splitting

```ts
function splitOnParagraphs(text: string): string[]
```

Splits on double newlines (blank lines between paragraphs). Code blocks are protected — a blank line inside a ` ``` ` fence does not trigger a split.

## Overlap chunks

```ts
function buildSubChunks(paragraphs, targetTokens, overlapTokens, headingPath)
```

Greedy left-to-right packing with overlap:

1. Add paragraphs to `current` until adding the next would exceed `targetTokens`
2. Flush `current` as a sub-chunk
3. Before starting the next sub-chunk, walk backwards through `current` collecting paragraphs until `overlapTokens` is reached — these become the start of the next sub-chunk

This ensures that context at chunk boundaries isn't lost. For example, with `targetTokens = 500` and `overlapTokens = 50`, the last ~50 tokens of chunk N appear at the start of chunk N+1.

### Example

Given a section with 4 paragraphs of ~200 tokens each (800 tokens total), with `targetTokens = 500`:

```
Paragraph 1 (200t)  ─┐
Paragraph 2 (200t)  ─┘ Chunk 0 (400t)
                        [overlap: Para 2]
Paragraph 2 (200t)  ─┐ (overlap)
Paragraph 3 (200t)  ─┤ Chunk 1 (400t)
Paragraph 4 (200t)  ─┘ (would exceed, becomes its own or next chunk)
```

## Chunk index

`chunkIndex` is a monotonically incrementing counter across all sections in the document. This preserves the original document order and allows the UI to understand where a chunk comes from positionally.
