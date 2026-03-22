import { vectorSearch } from "../db/chunks.ts";
import { embedQuery } from "../ingestion/embedder.ts";
import { config } from "../config.ts";
import type { ChunkSearchResult } from "../db/chunks.ts";

export type { ChunkSearchResult };

export async function search(query: string, topK: number = config.searchTopK): Promise<ChunkSearchResult[]> {
  const embedding = await embedQuery(query);
  return vectorSearch(embedding, topK);
}
