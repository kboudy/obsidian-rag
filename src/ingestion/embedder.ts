import { embed } from "../ollama.ts";
import type { Chunk } from "./chunker.ts";

export interface ChunkWithEmbedding extends Chunk {
  embedding: number[];
}

// nomic-embed-text performs best with task-specific prefixes
const DOCUMENT_PREFIX = "search_document: ";
const QUERY_PREFIX = "search_query: ";

export async function embedChunks(chunks: Chunk[]): Promise<ChunkWithEmbedding[]> {
  if (chunks.length === 0) return [];

  const texts = chunks.map(c => DOCUMENT_PREFIX + c.contentClean);
  const embeddings = await embed(texts);

  return chunks.map((chunk, i) => ({
    ...chunk,
    embedding: embeddings[i]!,
  }));
}

export async function embedQuery(query: string): Promise<number[]> {
  const embeddings = await embed([QUERY_PREFIX + query]);
  return embeddings[0]!;
}
