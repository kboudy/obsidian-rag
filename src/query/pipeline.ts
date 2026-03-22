import { search } from "./search.ts";
import { rerank } from "./reranker.ts";
import { generate } from "./generator.ts";
import { config } from "../config.ts";
import type { RerankResult } from "./reranker.ts";

export interface SourceInfo {
  fileName: string;
  filePath: string;
  headingPath: string;
  relevanceScore: number;
  preview: string;
  tags: string[];
}

export type QueryEvent =
  | { type: "sources"; sources: SourceInfo[] }
  | { type: "chunk"; text: string }
  | { type: "done"; fullText: string }
  | { type: "error"; message: string };

function toSourceInfo(r: RerankResult): SourceInfo {
  return {
    fileName: r.file_name,
    filePath: r.file_path,
    headingPath: r.heading_path,
    relevanceScore: r.relevanceScore,
    preview: r.content.slice(0, 300).replace(/\n+/g, " ").trim(),
    tags: r.tags,
  };
}

export async function* queryPipeline(query: string): AsyncGenerator<QueryEvent> {
  try {
    // 1. Vector search
    const candidates = await search(query, config.searchTopK);

    if (candidates.length === 0) {
      yield { type: "error", message: "No relevant documents found in the vault." };
      return;
    }

    // 2. Rerank
    const reranked = await rerank(query, candidates, config.rerankTopN);

    // 3. Emit sources immediately so the UI can show them while generation streams
    yield { type: "sources", sources: reranked.map(toSourceInfo) };

    // 4. Stream LLM answer
    let fullText = "";
    for await (const chunk of generate(query, reranked)) {
      fullText += chunk;
      yield { type: "chunk", text: chunk };
    }

    yield { type: "done", fullText };
  } catch (err) {
    yield { type: "error", message: err instanceof Error ? err.message : String(err) };
  }
}
