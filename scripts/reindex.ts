import { migrateDatabase } from "../src/db/schema.ts";
import { indexVault } from "../src/ingestion/pipeline.ts";
import { sql } from "../src/db/connection.ts";

const force = process.argv.includes("--force");

console.log("Running database migration...");
await migrateDatabase();

console.log(`Indexing vault${force ? " (force re-embed all)" : ""}...`);
const result = await indexVault({ force, verbose: true });

console.log(`
Done in ${(result.durationMs / 1000).toFixed(1)}s
  Added:   ${result.added}
  Updated: ${result.updated}
  Deleted: ${result.deleted}
  Skipped: ${result.skipped}
  Chunks:  ${result.totalChunks}
`);

await sql.close();
