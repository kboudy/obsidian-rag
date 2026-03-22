# `src/db/schema.ts` — Database Schema & Migrations

[View source](../../../src/db/schema.ts)

## Purpose

Defines the database schema and runs idempotent DDL migrations. Called on every app startup via `migrateDatabase()`.

## Why `sql.unsafe()`?

Bun's tagged template SQL (`sql\`...\``) is designed for parameterized queries. DDL statements like `CREATE EXTENSION` and `CREATE TABLE` cannot be parameterized, and Bun's `.simple()` mode (which allows multi-statement DDL) rejects template expressions. `sql.unsafe()` accepts a raw string and sends it directly to PostgreSQL — safe here because the strings are compile-time constants, not user input.

## Tables

### `documents`

Tracks each indexed Markdown file.

```sql
CREATE TABLE IF NOT EXISTS documents (
  id            SERIAL PRIMARY KEY,
  file_path     TEXT UNIQUE NOT NULL,   -- relative to vault root, e.g. "bash scripting.md"
  file_name     TEXT NOT NULL,          -- just the filename portion
  content_hash  TEXT NOT NULL,          -- SHA-256 of raw file content (change detection)
  mtime         TIMESTAMPTZ NOT NULL,   -- file modification time
  tags          TEXT[] DEFAULT '{}',    -- hashtags extracted by parser
  indexed_at    TIMESTAMPTZ DEFAULT NOW()
);
```

The `content_hash` column is the key to incremental indexing: if the hash of the current file content matches what's stored, the file is skipped entirely.

### `chunks`

Stores individual text chunks with their vector embeddings.

```sql
CREATE TABLE IF NOT EXISTS chunks (
  id              SERIAL PRIMARY KEY,
  document_id     INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index     INTEGER NOT NULL,         -- position within the document
  heading_path    TEXT NOT NULL DEFAULT '', -- e.g. "bash scripting > .bash_profile"
  content         TEXT NOT NULL,            -- raw markdown (shown in UI)
  content_clean   TEXT NOT NULL,            -- wikilinks stripped (used for embedding)
  token_count     INTEGER NOT NULL,
  embedding       vector(768),              -- 768-dim float vector (nomic-embed-text)
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

`ON DELETE CASCADE` means deleting a `documents` row automatically removes all its chunks — used during re-indexing and file deletion.

## Indexes

```sql
-- Fast lookup of a document by its vault path
CREATE INDEX IF NOT EXISTS idx_documents_file_path ON documents(file_path);

-- Join performance: find all chunks for a document
CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON chunks(document_id);

-- HNSW vector index for approximate nearest-neighbour search
CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

### Why HNSW?

HNSW (Hierarchical Navigable Small World) is pgvector's graph-based ANN index. Compared to IVFFlat:
- No training step — works immediately with any number of rows
- Better recall at small-to-medium corpus sizes (~1000 chunks)
- `m = 16`: each node has up to 16 bidirectional links (controls graph density vs. memory)
- `ef_construction = 64`: how many candidates are considered when building the graph (higher = better quality, slower build)
