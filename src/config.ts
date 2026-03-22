export const config = {
  vaultPath: process.env.VAULT_PATH ?? "/home/keith/second_brain",
  postgresUrl: process.env.POSTGRES_URL ?? "",
  ollamaUrl: process.env.OLLAMA_URL ?? "http://localhost:11434",
  ollamaEmbedModel: process.env.OLLAMA_EMBED_MODEL ?? "nomic-embed-text",
  ollamaChatModel: process.env.OLLAMA_CHAT_MODEL ?? "llama3.2:3b",
  cohereApiKey: process.env.COHERE_API_KEY ?? "",
  port: Number(process.env.PORT ?? 3000),
  embeddingDimension: 768,
  chunkTargetTokens: 500,
  chunkOverlapTokens: 50,
  searchTopK: 20,
  rerankTopN: 5,
} as const;
