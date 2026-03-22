# `src/db/documents.ts` — Documents Table CRUD

[View source](../../../src/db/documents.ts)

## Purpose

All database reads and writes for the `documents` table. Each row represents one Markdown file from the vault.

## Type

```ts
interface DocumentRecord {
  id: number;
  file_path: string;    // relative to vault root: "bash scripting.md"
  file_name: string;    // filename only
  content_hash: string; // SHA-256 hex digest
  mtime: Date;
  tags: string[];
  indexed_at: Date;
}
```

## Functions

### `upsertDocument(doc)`

Insert a new document or update an existing one (matched by `file_path`). Returns the row `id`.

```ts
const docId = await upsertDocument({
  file_path: "bash scripting.md",
  file_name: "bash scripting.md",
  content_hash: "abc123...",
  mtime: new Date(),
  tags: ["bash", "linux"],
});
```

Uses PostgreSQL's `INSERT ... ON CONFLICT (file_path) DO UPDATE` pattern (upsert). `RETURNING id` gives back the row ID whether it was inserted or updated — needed by the ingestion pipeline to associate chunks with the correct document.

```sql
INSERT INTO documents (file_path, file_name, content_hash, mtime, tags)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (file_path) DO UPDATE SET
  file_name    = EXCLUDED.file_name,
  content_hash = EXCLUDED.content_hash,
  mtime        = EXCLUDED.mtime,
  tags         = EXCLUDED.tags,
  indexed_at   = NOW()
RETURNING id
```

The `sql.array(doc.tags)` call converts a JavaScript string array into a PostgreSQL `TEXT[]` literal.

### `getDocumentByPath(filePath)`

Fetch a single document by its vault-relative path, or `null` if not found. Used by the ingestion pipeline to check if a file has already been indexed and whether its hash has changed.

### `getAllDocuments()`

Return all documents ordered by `file_path`. Used by `GET /api/documents` and `GET /api/status`.

### `deleteDocument(id)`

Delete a document by its primary key. Because `chunks` has `ON DELETE CASCADE`, this also removes all associated chunks automatically.

### `getAllDocumentPaths()`

Return only the `file_path` column for all rows. Used during vault scanning to find files that exist in the DB but have been deleted from disk.
