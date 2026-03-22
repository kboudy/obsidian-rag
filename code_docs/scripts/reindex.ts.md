# `scripts/reindex.ts` — Manual Re-index Script

[View source](../../scripts/reindex.ts)

## Purpose

CLI script for manually triggering a full vault re-index. Useful for forcing a fresh embedding of all files (e.g. after switching to a different embedding model) or for debugging.

## Usage

```sh
# Incremental: only re-embed new/changed files
bun scripts/reindex.ts

# Force: re-embed every file regardless of hash
bun scripts/reindex.ts --force
```

## What it does

1. **Runs `migrateDatabase()`** — Ensures the schema is up to date before indexing.
2. **Calls `indexVault({ force, verbose: true })`** — Verbose mode prints each file being added/updated/deleted.
3. **Prints summary** on completion:

```
Done in 28.4s
  Added:   212
  Updated: 0
  Deleted: 0
  Skipped: 0
  Chunks:  1038
```

4. **Closes the connection** — `await sql.close()` before process exit.

## `--force` flag

Without `--force`, files with unchanged SHA-256 hashes are skipped. With `--force`, every file is re-parsed, re-chunked, and re-embedded regardless of hash. Use this when:
- You change the embedding model (e.g. switch from `nomic-embed-text` to another model)
- You change chunking parameters (`chunkTargetTokens`, `chunkOverlapTokens`)
- You suspect the index is corrupt
