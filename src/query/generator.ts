import { chat } from "../ollama.ts";
import type { RerankResult } from "./reranker.ts";

function buildPrompt(query: string, contexts: RerankResult[]): string {
  const contextBlocks = contexts
    .map(r => {
      const source = r.heading_path
        ? `${r.file_name} > ${r.heading_path}`
        : r.file_name;
      return `[Source: ${source}]\n${r.content}`;
    })
    .join("\n\n---\n\n");

  return `You are a helpful assistant that answers questions based on the user's personal knowledge base (an Obsidian vault).

Use the following context passages to answer the question. When referencing information, mention the source note name. If the answer isn't in the provided context, say so honestly — don't make things up.

--- Context ---

${contextBlocks}

--- End Context ---

Question: ${query}`;
}

export async function* generate(query: string, contexts: RerankResult[]): AsyncGenerator<string> {
  const prompt = buildPrompt(query, contexts);
  yield* chat([{ role: "user", content: prompt }]);
}
