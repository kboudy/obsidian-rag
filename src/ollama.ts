import { config } from "./config.ts";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const EMBED_BATCH_SIZE = 50;

export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const allEmbeddings: number[][] = [];

  // Process in batches
  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
    const response = await fetch(`${config.ollamaUrl}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: config.ollamaEmbedModel, input: batch }),
    });

    if (!response.ok) {
      throw new Error(`Ollama embed error: ${response.status} ${await response.text()}`);
    }

    const data = (await response.json()) as { embeddings: number[][] };
    allEmbeddings.push(...data.embeddings);
  }

  return allEmbeddings;
}

export async function* chat(messages: ChatMessage[]): AsyncGenerator<string> {
  const response = await fetch(`${config.ollamaUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.ollamaChatModel,
      messages,
      stream: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama chat error: ${response.status} ${await response.text()}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const chunk = JSON.parse(line) as { message?: { content?: string }; done?: boolean };
        if (chunk.message?.content) {
          yield chunk.message.content;
        }
      } catch {
        // skip malformed lines
      }
    }
  }
}

export async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${config.ollamaUrl}/`, { signal: AbortSignal.timeout(3000) });
    return response.ok;
  } catch {
    return false;
  }
}
