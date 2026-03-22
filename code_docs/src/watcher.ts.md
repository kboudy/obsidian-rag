# `src/watcher.ts` — Vault File Watcher

[View source](../../src/watcher.ts)

## Purpose

Watches the Obsidian vault directory for file changes and automatically re-indexes modified Markdown files. Uses Node's `fs.watch` (available in Bun) with debouncing to handle Obsidian's multiple-write save pattern.

## `startWatcher(): void`

```ts
const watcher = watch(config.vaultPath, { recursive: true }, (event, relativePath) => {
  if (!relativePath?.endsWith(".md")) return;
  if (relativePath.startsWith(".obsidian/") || relativePath.startsWith(".trash/")) return;
  // ... debounce then reindexFile(relativePath)
});
```

`{ recursive: true }` monitors all subdirectories. The callback receives an `event` type (`"rename"` or `"change"`) and the `relativePath` of the changed file. Only `.md` files outside Obsidian's system directories trigger re-indexing.

## Debouncing

Obsidian's auto-save fires multiple `fs.watch` events for a single logical save (write + rename + write). Without debouncing, the same file would be re-embedded 2–4 times per save.

A `Map<string, Timer>` tracks pending re-index timers keyed by file path:

```ts
const pending = new Map<string, Timer>();

// On each fs event:
const existing = pending.get(relativePath);
if (existing) clearTimeout(existing);  // cancel previous timer

pending.set(relativePath, setTimeout(async () => {
  pending.delete(relativePath);
  await reindexFile(relativePath);  // runs 2s after the last event
}, 2000));
```

If a file triggers 3 events within 2 seconds (common with Obsidian), only the last one fires `reindexFile`. The 2-second window is generous enough to catch all save events.

## Graceful shutdown

`SIGINT` (Ctrl+C) closes the watcher before exiting:

```ts
process.on("SIGINT", () => {
  watcher.close();
  process.exit(0);
});
```

Without this, the `fs.watch` handle would keep the process alive after Ctrl+C.

## Re-index behaviour

`reindexFile()` (from `src/ingestion/pipeline.ts`) handles three cases:
- **File deleted** → removes document + chunks from DB
- **File unchanged** (same hash) → no-op
- **File changed** → re-parse, re-chunk, re-embed, upsert in transaction
