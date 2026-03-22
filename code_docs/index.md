# Obsidian RAG — Architecture Overview

This document describes the high-level architecture of the system. Each module has its own dedicated doc in this directory.

## What it does

The system indexes all Markdown files in an Obsidian vault into a PostgreSQL vector database, then lets you ask natural-language questions about your notes. It uses a retrieval-augmented generation (RAG) pipeline:

1. **Ingest** — Parse vault files → split into chunks → embed with Ollama → store in pgvector
2. **Query** — Embed the question → vector search → rerank with Cohere → generate an answer with Ollama
3. **Serve** — Bun HTTP server streams the answer and sources to a React UI via Server-Sent Events

## Module map

```
index.ts                        App entrypoint (migrate → index → watch → serve)

src/
  config.ts                     Centralised runtime config (reads .env)
  ollama.ts                     HTTP client for Ollama embed + chat APIs

  db/
    connection.ts               Bun.sql singleton
    schema.ts                   Idempotent DDL migrations (pgvector tables + HNSW index)
    documents.ts                CRUD for the `documents` table
    chunks.ts                   CRUD + cosine vector search for the `chunks` table

  ingestion/
    scanner.ts                  Glob *.md files in vault, skip .obsidian/
    parser.ts                   Obsidian-aware Markdown → ParsedDocument (tags, sections)
    chunker.ts                  Hybrid heading + size-based chunking with overlap
    embedder.ts                 Batch embed chunks via Ollama (task-prefix aware)
    pipeline.ts                 Orchestrator: scan → parse → chunk → embed → upsert

  query/
    search.ts                   Embed query + run pgvector cosine search
    reranker.ts                 Cohere rerank-v3.5 (with vector-order fallback)
    generator.ts                Build RAG prompt + stream Ollama chat response
    pipeline.ts                 Orchestrator: search → rerank → generate (yields SSE events)

  server.ts                     Bun.serve() — routes, SSE streaming, HTML import
  watcher.ts                    fs.watch on vault with 2-second debounce

frontend/
  App.tsx                       React root — mounts SearchView
  SearchView.tsx                Main UI — SSE reader, state machine, renders results
  StreamingResponse.tsx         Inline markdown renderer with streaming cursor
  SourceCard.tsx                Individual source chunk card

scripts/
  setup-db.ts                   One-time migration + verification
  reindex.ts                    Manual full re-index CLI
```

## Data flow

### Ingestion

```
Vault .md files
  → scanner.ts       (discover, get mtime)
  → parser.ts        (extract tags, split by heading, clean wikilinks)
  → chunker.ts       (≤500 token sections, 50-token overlap)
  → embedder.ts      (Ollama nomic-embed-text, batch 50, "search_document:" prefix)
  → db/chunks.ts     (INSERT with ::vector cast)
  → db/documents.ts  (UPSERT, SHA-256 hash for change detection)
```

### Query

```
User question
  → embedder.embedQuery()    ("search_query:" prefix)
  → db/chunks.vectorSearch() (pgvector cosine, top-20)
  → reranker.rerank()        (Cohere rerank-v3.5, top-5)
  → generator.generate()     (Ollama llama3.2, streamed NDJSON)
  → server.ts                (SSE: sources event, then chunk events, then done)
  → SearchView.tsx           (reads SSE stream, updates React state)
```

## Key design decisions

| Decision | Rationale |
|----------|-----------|
| HNSW index over IVFFlat | HNSW requires no training data; works at any corpus size |
| Hybrid chunking | Heading-based splits preserve semantic boundaries; size cap prevents token overflow |
| nomic-embed-text task prefixes | `search_document:` / `search_query:` prefixes significantly improve retrieval quality |
| SHA-256 content hash | Skip re-embedding unchanged files on every startup |
| Cohere rerank fallback | If API key is absent, gracefully falls back to vector similarity order |
| SSE over WebSocket | One-way streaming from server to browser; simpler than WebSocket for this use case |
