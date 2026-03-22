# `index.ts` — Application Entrypoint

[View source](../index.ts)

## Purpose

Top-level entrypoint. Runs four sequential startup steps then hands off to long-running processes (file watcher + HTTP server).

## Startup sequence

```ts
async function main() {
  await migrateDatabase();   // 1. Ensure DB schema is up to date
  await indexVault();        // 2. Sync vault files into the vector DB
  startWatcher();            // 3. Watch vault for live changes
  startServer();             // 4. Start the HTTP server
}
```

### Step 1 — `migrateDatabase()`

Runs idempotent DDL (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`). Safe to run on every boot. See [`src/db/schema.ts`](src/db/schema.ts.md).

### Step 2 — `indexVault()`

Scans the vault and embeds any new or changed files. The hash-based change detection means this is fast on subsequent starts when nothing has changed. The result is logged:

```ts
if (result.added + result.updated + result.deleted > 0) {
  console.log(`Index updated: +${result.added} added, ...`);
} else {
  console.log(`Index up to date (${result.skipped} files unchanged)`);
}
```

See [`src/ingestion/pipeline.ts`](src/ingestion/pipeline.ts.md).

### Step 3 — `startWatcher()`

Sets up `fs.watch` on the vault directory. Any `.md` file that changes is re-embedded after a 2-second debounce. See [`src/watcher.ts`](src/watcher.ts.md).

### Step 4 — `startServer()`

Starts `Bun.serve()` on the configured port (default 3000). See [`src/server.ts`](src/server.ts.md).

## Error handling

If any startup step throws, the error is logged and the process exits with code 1:

```ts
main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
```
