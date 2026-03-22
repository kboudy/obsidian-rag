import { watch } from "fs";
import { config } from "./config.ts";
import { reindexFile } from "./ingestion/pipeline.ts";

export function startWatcher(): void {
  const debounceMs = 2000;
  const pending = new Map<string, Timer>();

  const watcher = watch(config.vaultPath, { recursive: true }, (event, relativePath) => {
    if (!relativePath?.endsWith(".md")) return;
    if (relativePath.startsWith(".obsidian/") || relativePath.startsWith(".trash/")) return;

    const existing = pending.get(relativePath);
    if (existing) clearTimeout(existing);

    pending.set(relativePath, setTimeout(async () => {
      pending.delete(relativePath);
      try {
        await reindexFile(relativePath);
        console.log(`[watcher] re-indexed: ${relativePath}`);
      } catch (err) {
        console.error(`[watcher] error re-indexing ${relativePath}:`, err);
      }
    }, debounceMs));
  });

  process.on("SIGINT", () => {
    watcher.close();
    process.exit(0);
  });
}
