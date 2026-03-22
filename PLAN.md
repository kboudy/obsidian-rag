# Plan: Obsidian RAG System

## Context
Build a RAG system to search and query 212 Obsidian markdown documents in `/home/keith/second_brain`. Uses local Ollama for embeddings + generation, PostgreSQL with pgvector for vector storage, Cohere Rerank for retrieval quality, and a React web UI served by Bun.

## Stack
- **Runtime**: Bun (Bun.serve, Bun.sql, Bun.file, bun:test)
- **Embeddings**: Ollama `nomic-embed-text` (768d vectors)
- **LLM**: Ollama `llama3.2` (local, for answer generation)
- **Reranking**: Cohere Rerank API (`rerank-v3.5`)
- **Vector DB**: PostgreSQL + pgvector (HNSW index)
- **Frontend**: React via Bun HTML imports
- **File watching**: `fs.watch` with debouncing for auto re-indexing

## File Structure

```
obsidian-rag/
  .env                          # DB url, Ollama url, Cohere key, vault path
  index.ts                      # Entrypoint: migrate, index, watch, serve
  index.html                    # HTML shell for React SPA
  package.json
  src/
    config.ts                   # Typed config from process.env
    db/
      connection.ts             # Bun.sql singleton
      schema.ts                 # CREATE EXTENSION vector + tables (idempotent)
      documents.ts              # CRUD for documents table
      chunks.ts                 # CRUD + vector search for chunks table
    ingestion/
      scanner.ts                # Glob for *.md files in vault
      parser.ts                 # Markdown -> sections (tags, headings, clean text)
      chunker.ts                # Hybrid heading + size-based chunking (~500 tokens)
      embedder.ts               # Batch embed via Ollama /api/embed
      pipeline.ts               # Orchestrator: scan -> parse -> chunk -> embed -> store
    query/
      search.ts                 # pgvector cosine similarity search
      reranker.ts               # Cohere Rerank API wrapper (with fallback)
      generator.ts              # Ollama /api/chat streaming
      pipeline.ts               # Orchestrator: embed query -> search -> rerank -> generate
    watcher.ts                  # fs.watch on vault, debounced re-indexing
    ollama.ts                   # Shared Ollama HTTP client (embed + chat)
    server.ts                   # Bun.serve() with routes + SSE streaming
  frontend/
    App.tsx                     # Root React component
    SearchView.tsx              # Query input + streaming results
    StreamingResponse.tsx       # Renders streaming LLM text
    SourceCard.tsx              # Displays source chunk with metadata
    styles.css                  # Dark theme CSS
  tests/
    parser.test.ts
    chunker.test.ts
  scripts/
    setup-db.ts                 # Creates DB + pgvector extension
    reindex.ts                  # Manual full re-index
```

## Database Schema

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE documents (
  id            SERIAL PRIMARY KEY,
  file_path     TEXT UNIQUE NOT NULL,     -- relative to vault root
  file_name     TEXT NOT NULL,
  content_hash  TEXT NOT NULL,            -- SHA-256 for change detection
  mtime         TIMESTAMPTZ NOT NULL,
  tags          TEXT[] DEFAULT '{}',
  indexed_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE chunks (
  id              SERIAL PRIMARY KEY,
  document_id     INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index     INTEGER NOT NULL,
  heading_path    TEXT NOT NULL DEFAULT '',  -- e.g. "Navigation > Basic"
  content         TEXT NOT NULL,             -- raw (for display)
  content_clean   TEXT NOT NULL,             -- cleaned (for embedding)
  token_count     INTEGER NOT NULL,
  embedding       vector(768),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- HNSW index (good at any scale, no training needed)
CREATE INDEX idx_chunks_embedding ON chunks
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
```

## Implementation Phases

### Phase 1: Environment Setup (manual)
1. Install pgvector: `sudo apt install postgresql-16-pgvector`
2. Create DB: `sudo -u postgres createdb obsidian_rag` + `CREATE EXTENSION vector`
3. Pull Ollama models: `ollama pull nomic-embed-text` and `ollama pull llama3.2`
4. Create `.env` with `POSTGRES_URL`, `VAULT_PATH`, `OLLAMA_URL`, `COHERE_API_KEY`, etc.
5. Install deps: `bun install react react-dom` + `bun install -d @types/react @types/react-dom`

### Phase 2: Config + DB Layer
1. `src/config.ts` — typed config object reading from process.env
2. `src/db/connection.ts` — Bun.sql singleton
3. `src/db/schema.ts` — idempotent migration with `sql.unsafe()` for DDL
4. `src/db/documents.ts` — upsert, get, delete operations
5. `src/db/chunks.ts` — insert, delete, vector search query
6. `scripts/setup-db.ts` — run migration, verify tables
- **Test**: `bun scripts/setup-db.ts` creates tables successfully

### Phase 3: Parser + Chunker (no external deps needed)
1. `src/ingestion/parser.ts` — Obsidian markdown parser:
   - Extract hashtags as tags (regex: `(?:^|\s)#([a-zA-Z_]\w*)`)
   - Split on heading boundaries, track heading hierarchy
   - Clean for embedding: `[[target|display]]` -> `display`, strip `![](...)` images
   - Don't split mid-code-block (track triple-backtick fences)
2. `src/ingestion/chunker.ts` — hybrid chunking:
   - Keep sections under 500 tokens as-is
   - Split large sections on paragraph boundaries, then sentences
   - Apply 50-token overlap between sub-chunks
   - Prepend heading path as context prefix
   - Token estimation: `Math.ceil(text.length / 4)`
3. `tests/parser.test.ts` + `tests/chunker.test.ts`
- **Test**: `bun test`

### Phase 4: Ollama Client + Embedder
1. `src/ollama.ts`:
   - `embed(texts: string[])` — POST `/api/embed` with batch of texts
   - `chat(messages, onChunk)` — POST `/api/chat` with `stream: true`, parse NDJSON
   - `checkHealth()` — GET `/`
2. `src/ingestion/embedder.ts` — batch embed chunks (50 per request)
   - Prepend `"search_document: "` for documents (nomic-embed-text task prefix)
- **Test**: embed a single chunk, verify 768d vector returned

### Phase 5: Ingestion Pipeline
1. `src/ingestion/scanner.ts` — `new Glob("**/*.md").scan()` on vault
2. `src/ingestion/pipeline.ts` — orchestrator:
   - Scan vault, read each file with `Bun.file().text()`
   - Hash with `new Bun.CryptoHasher("sha256")`, skip unchanged files
   - Parse -> chunk -> embed -> upsert in transaction
   - Handle deletions (files removed from vault)
   - Return stats: `{ added, updated, deleted, skipped, totalChunks }`
3. `scripts/reindex.ts` — CLI entry for manual re-indexing
- **Test**: `bun scripts/reindex.ts` indexes all 212 files

### Phase 6: Query Pipeline
1. `src/query/search.ts` — pgvector cosine search, top-20 candidates
2. `src/query/reranker.ts` — Cohere `/v2/rerank` API, return top-5; graceful fallback if key missing
3. `src/query/generator.ts` — build prompt with context chunks + source attribution, stream via Ollama
4. `src/query/pipeline.ts` — orchestrator yielding typed SSE events:
   - `{ type: "sources", sources }` after reranking
   - `{ type: "chunk", text }` for each streaming token
   - `{ type: "done" }` / `{ type: "error", message }`
   - Query embedding uses `"search_query: "` prefix
- **Test**: `curl -X POST localhost:3000/api/query -d '{"query":"how do I use git rebase?"}'`

### Phase 7: Web Server
1. `src/server.ts` — Bun.serve() with routes:
   - `GET /` — HTML import (React SPA)
   - `POST /api/query` — SSE streaming response from query pipeline
   - `POST /api/index` — trigger re-index
   - `GET /api/status` — health check (Ollama, DB, stats)
   - `GET /api/documents` — list indexed docs
2. Update `index.ts` entrypoint: migrate -> index -> watch -> serve

### Phase 8: Frontend
1. `index.html` — HTML shell with React mount point
2. `frontend/App.tsx` — root component, state management
3. `frontend/SearchView.tsx` — query input, SSE reader via `fetch` + `getReader()`, renders streaming text + sources
4. `frontend/StreamingResponse.tsx` — renders LLM text as it streams
5. `frontend/SourceCard.tsx` — file name, heading breadcrumb, relevance score, preview, tags
6. `frontend/styles.css` — dark theme to match Obsidian aesthetic
- **Test**: open `localhost:3000` in browser, submit a query

### Phase 9: File Watcher
1. `src/watcher.ts` — `fs.watch(vaultPath, { recursive: true })`:
   - Filter to `.md` files only
   - 2-second debounce (Obsidian fires multiple events per save)
   - On change: read, hash, re-embed if changed
   - On delete: remove document + chunks from DB
- **Test**: edit a vault file, verify re-indexing in console output

## Key Design Details

- **nomic-embed-text task prefixes**: Documents get `"search_document: "` prefix, queries get `"search_query: "`. Critical for retrieval quality.
- **pgvector format**: Pass embeddings as string `'[0.1, 0.2, ...]'` cast with `::vector` in SQL queries.
- **Incremental indexing**: SHA-256 content hash comparison — skip unchanged files.
- **Cohere fallback**: If API key missing or call fails, return vector search results as-is.
- **Code block safety**: Parser tracks triple-backtick fences to avoid splitting mid-block.

## Verification
1. `bun test` — parser and chunker unit tests pass
2. `bun scripts/setup-db.ts` — tables and indexes created
3. `bun scripts/reindex.ts` — all 212 vault files indexed
4. `bun run index.ts` — server starts, web UI loads at localhost:3000
5. Query "how do I use git rebase?" returns relevant chunks from git notes
6. Edit a vault file, verify file watcher triggers re-indexing
