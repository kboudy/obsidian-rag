# `src/ingestion/scanner.ts` — Vault File Scanner

[View source](../../../src/ingestion/scanner.ts)

## Purpose

Discovers all Markdown files in the Obsidian vault, returning their paths and modification times.

## `scanVault(vaultPath?): Promise<VaultFile[]>`

```ts
interface VaultFile {
  relativePath: string;  // "bash scripting.md" or "subfolder/note.md"
  absolutePath: string;  // "/home/keith/second_brain/bash scripting.md"
  mtime: Date;
}
```

### How it works

Uses Bun's `Glob` API to recursively find all `*.md` files:

```ts
const glob = new Bun.Glob("**/*.md");
for await (const relativePath of glob.scan({ cwd: vaultPath, absolute: false })) {
  // ...
}
```

`glob.scan()` returns an async iterator — each iteration yields a relative path string. Setting `absolute: false` keeps paths relative to `cwd`, which is what the database stores.

### Filtering

Obsidian stores its own system files under `.obsidian/` and deleted files under `.trash/`. These are excluded:

```ts
if (relativePath.startsWith(".obsidian/") || relativePath.startsWith(".trash/")) continue;
```

### Modification time

`Bun.file(path).lastModified` returns a Unix timestamp in milliseconds, wrapped in `new Date()`:

```ts
const file = Bun.file(absolutePath);
mtime: new Date(file.lastModified)
```

This is used by the ingestion pipeline to store when the file was last modified (informational; the actual change detection uses the SHA-256 hash).

### Sorting

Results are sorted alphabetically by `relativePath` for deterministic, reproducible indexing order:

```ts
return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
```
