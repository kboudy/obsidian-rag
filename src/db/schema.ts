import { sql } from "./connection.ts";
import { config } from "../config.ts";

export async function migrateDatabase(): Promise<void> {
  // Use sql.unsafe() for DDL — simple() doesn't allow parameters, and
  // tagged templates can't be used for multi-statement DDL with CREATE EXTENSION
  await sql.unsafe(`CREATE EXTENSION IF NOT EXISTS vector`);

  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS documents (
      id            SERIAL PRIMARY KEY,
      file_path     TEXT UNIQUE NOT NULL,
      file_name     TEXT NOT NULL,
      content_hash  TEXT NOT NULL,
      mtime         TIMESTAMPTZ NOT NULL,
      tags          TEXT[] DEFAULT '{}',
      indexed_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS chunks (
      id              SERIAL PRIMARY KEY,
      document_id     INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      chunk_index     INTEGER NOT NULL,
      heading_path    TEXT NOT NULL DEFAULT '',
      content         TEXT NOT NULL,
      content_clean   TEXT NOT NULL,
      token_count     INTEGER NOT NULL,
      embedding       vector(${config.embeddingDimension}),
      created_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_documents_file_path ON documents(file_path)`);
  await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON chunks(document_id)`);

  // HNSW index for vector similarity search — works at any scale, no training needed
  await sql.unsafe(`
    CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON chunks
      USING hnsw (embedding vector_cosine_ops)
      WITH (m = 16, ef_construction = 64)
  `);
}
