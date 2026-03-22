# `scripts/setup-db.ts` — Database Setup Script

[View source](../../scripts/setup-db.ts)

## Purpose

One-time setup and verification script. Runs the full database migration and prints a summary of what was created. Useful for initial setup and for confirming the schema is correct after changes.

## Usage

```sh
bun scripts/setup-db.ts
```

## What it does

1. **Runs `migrateDatabase()`** — Creates the `vector` extension, `documents` table, `chunks` table, and all indexes (all `IF NOT EXISTS`, so safe to re-run).

2. **Verifies tables exist** — Queries `pg_tables` for the `public` schema and prints the names.

3. **Verifies indexes exist** — Queries `pg_indexes` and prints the names.

4. **Confirms pgvector version** — Queries `pg_extension` to show the installed version of `vector`.

5. **Closes the connection** — `await sql.close()` cleanly shuts down the connection pool.

## Example output

```
Running database migration...
Migration complete. Verifying tables...
Tables: chunks, documents
Indexes: idx_chunks_document_id, idx_chunks_embedding, idx_documents_file_path, ...
pgvector: { extname: 'vector', extversion: '0.6.0' }
```

## Error handling

If the migration fails (e.g. wrong credentials, pgvector not installed), the error is logged and the process exits with code 1. The `finally` block ensures the DB connection is always closed.
