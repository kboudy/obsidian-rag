import { migrateDatabase } from "./src/db/schema.ts";
import { indexVault } from "./src/ingestion/pipeline.ts";
import { startServer } from "./src/server.ts";
import { startWatcher } from "./src/watcher.ts";

async function main() {
  console.log("Migrating database...");
  await migrateDatabase();

  console.log("Checking for new/changed vault files...");
  const result = await indexVault();
  if (result.added + result.updated + result.deleted > 0) {
    console.log(`Index updated: +${result.added} added, ~${result.updated} updated, -${result.deleted} deleted (${result.totalChunks} chunks)`);
  } else {
    console.log(`Index up to date (${result.skipped} files unchanged)`);
  }

  console.log("Starting file watcher...");
  startWatcher();

  startServer();
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
