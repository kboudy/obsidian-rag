import type { ParsedSection } from "./parser.ts";

export interface Chunk {
  chunkIndex: number;
  headingPath: string;
  content: string;      // raw (for display)
  contentClean: string; // cleaned (for embedding)
  tokenCount: number;
}

/** Rough token estimate: ~4 chars per token for English text */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Split text on paragraph boundaries (double newlines), keeping code blocks intact */
function splitOnParagraphs(text: string): string[] {
  const parts: string[] = [];
  const lines = text.split("\n");
  let currentBlock: string[] = [];
  let inCodeBlock = false;

  for (const line of lines) {
    if (line.trimStart().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      currentBlock.push(line);
      continue;
    }

    if (!inCodeBlock && line.trim() === "" && currentBlock.length > 0) {
      parts.push(currentBlock.join("\n"));
      currentBlock = [];
    } else {
      currentBlock.push(line);
    }
  }

  if (currentBlock.length > 0) {
    parts.push(currentBlock.join("\n"));
  }

  return parts.filter(p => p.trim().length > 0);
}

/** Create overlapping sub-chunks from a list of paragraphs */
function buildSubChunks(
  paragraphs: string[],
  targetTokens: number,
  overlapTokens: number,
  headingPath: string,
): Array<{ content: string; tokenCount: number }> {
  const subChunks: Array<{ content: string; tokenCount: number }> = [];
  let current: string[] = [];
  let currentTokens = 0;

  for (const para of paragraphs) {
    const paraTokens = estimateTokens(para);

    if (currentTokens + paraTokens > targetTokens && current.length > 0) {
      subChunks.push({
        content: current.join("\n\n"),
        tokenCount: currentTokens,
      });

      // Build overlap: take paragraphs from end of current until we hit overlapTokens
      const overlapParas: string[] = [];
      let overlapCount = 0;
      for (let i = current.length - 1; i >= 0; i--) {
        const t = estimateTokens(current[i]!);
        if (overlapCount + t > overlapTokens) break;
        overlapParas.unshift(current[i]!);
        overlapCount += t;
      }

      current = [...overlapParas, para];
      currentTokens = overlapCount + paraTokens;
    } else {
      current.push(para);
      currentTokens += paraTokens;
    }
  }

  if (current.length > 0) {
    subChunks.push({
      content: current.join("\n\n"),
      tokenCount: currentTokens,
    });
  }

  return subChunks;
}

export function chunkSections(
  sections: ParsedSection[],
  targetTokens: number,
  overlapTokens: number,
): Chunk[] {
  const chunks: Chunk[] = [];
  let chunkIndex = 0;

  for (const section of sections) {
    const tokens = estimateTokens(section.content);

    if (tokens <= targetTokens) {
      // Section fits in one chunk
      chunks.push({
        chunkIndex: chunkIndex++,
        headingPath: section.headingPath,
        content: section.content,
        contentClean: section.contentClean,
        tokenCount: tokens,
      });
    } else {
      // Section is too large — split on paragraphs
      const paragraphs = splitOnParagraphs(section.content);
      const cleanParagraphs = splitOnParagraphs(section.contentClean);
      const subChunks = buildSubChunks(paragraphs, targetTokens, overlapTokens, section.headingPath);
      const cleanSubChunks = buildSubChunks(cleanParagraphs, targetTokens, overlapTokens, section.headingPath);

      for (let i = 0; i < subChunks.length; i++) {
        const sub = subChunks[i]!;
        const cleanSub = cleanSubChunks[i] ?? sub;
        chunks.push({
          chunkIndex: chunkIndex++,
          headingPath: section.headingPath,
          content: sub.content,
          contentClean: cleanSub.content,
          tokenCount: sub.tokenCount,
        });
      }
    }
  }

  return chunks;
}
