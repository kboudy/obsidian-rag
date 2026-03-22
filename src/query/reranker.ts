import { config } from "../config.ts";
import type { ChunkSearchResult } from "../db/chunks.ts";

export interface RerankResult extends ChunkSearchResult {
  relevanceScore: number;
}

export async function rerank(query: string, results: ChunkSearchResult[], topN: number = config.rerankTopN): Promise<RerankResult[]> {
  // Fallback to vector similarity order if no API key
  if (!config.cohereApiKey || config.cohereApiKey === "your-cohere-api-key-here") {
    return results.slice(0, topN).map(r => ({ ...r, relevanceScore: r.similarity }));
  }

  try {
    const response = await fetch("https://api.cohere.com/v2/rerank", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.cohereApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "rerank-v3.5",
        query,
        documents: results.map(r => r.content),
        top_n: topN,
        return_documents: false,
      }),
    });

    if (!response.ok) {
      console.warn(`Cohere rerank failed (${response.status}), falling back to vector order`);
      return results.slice(0, topN).map(r => ({ ...r, relevanceScore: r.similarity }));
    }

    const data = (await response.json()) as {
      results: Array<{ index: number; relevance_score: number }>;
    };

    return data.results.map(item => ({
      ...results[item.index]!,
      relevanceScore: item.relevance_score,
    }));
  } catch (err) {
    console.warn("Cohere rerank error, falling back to vector order:", err);
    return results.slice(0, topN).map(r => ({ ...r, relevanceScore: r.similarity }));
  }
}
