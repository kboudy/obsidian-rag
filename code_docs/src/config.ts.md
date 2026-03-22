# `src/config.ts` — Runtime Configuration

[View source](../../src/config.ts)

## Purpose

Single source of truth for all runtime configuration. Reads from environment variables (Bun auto-loads `.env`) and provides typed, immutable defaults.

## The config object

```ts
export const config = {
  vaultPath:          process.env.VAULT_PATH          ?? "/home/keith/second_brain",
  postgresUrl:        process.env.POSTGRES_URL         ?? "",
  ollamaUrl:          process.env.OLLAMA_URL           ?? "http://localhost:11434",
  ollamaEmbedModel:   process.env.OLLAMA_EMBED_MODEL   ?? "nomic-embed-text",
  ollamaChatModel:    process.env.OLLAMA_CHAT_MODEL    ?? "llama3.2:3b",
  cohereApiKey:       process.env.COHERE_API_KEY       ?? "",
  port:               Number(process.env.PORT          ?? 3000),

  // Tuning constants (not overridable via env)
  embeddingDimension: 768,   // nomic-embed-text output size
  chunkTargetTokens:  500,   // max tokens per chunk before splitting
  chunkOverlapTokens: 50,    // overlap between consecutive sub-chunks
  searchTopK:         20,    // vector search candidate count
  rerankTopN:         5,     // final results after Cohere reranking
} as const;
```

`as const` makes every value a literal type, preventing accidental mutation and enabling TypeScript to infer exact types.

## Environment variables (`.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_URL` | `""` | PostgreSQL connection URL (TCP with credentials) |
| `VAULT_PATH` | `/home/keith/second_brain` | Absolute path to Obsidian vault |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama daemon base URL |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text` | Model used for embeddings |
| `OLLAMA_CHAT_MODEL` | `llama3.2:3b` | Model used for answer generation |
| `COHERE_API_KEY` | `""` | Cohere API key for reranking (optional) |
| `PORT` | `3000` | HTTP server port |

## Tuning constants

- **`embeddingDimension: 768`** — `nomic-embed-text` always produces 768-dimensional vectors. This must match the `vector(768)` column in the `chunks` table.
- **`chunkTargetTokens: 500`** — Sections larger than ~2000 characters get split further. Chosen to stay well within `nomic-embed-text`'s 8192-token context limit.
- **`chunkOverlapTokens: 50`** — ~200 characters of overlap prevents context loss at chunk boundaries.
- **`searchTopK: 20`** — Cast a wide net before reranking. More candidates = better reranking quality at the cost of slightly more tokens sent to Cohere.
- **`rerankTopN: 5`** — The top 5 reranked chunks are injected into the LLM prompt as context.
