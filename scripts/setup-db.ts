import { migrateDatabase } from "../src/db/schema.ts";
import { sql } from "../src/db/connection.ts";

console.log("Running database migration...");

try {
  await migrateDatabase();
  console.log("Migration complete. Verifying tables...");

  const tables = await sql`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `;
  console.log("Tables:", (tables as { tablename: string }[]).map(t => t.tablename).join(", "));

  const indexes = await sql`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public'
    ORDER BY indexname
  `;
  console.log("Indexes:", (indexes as { indexname: string }[]).map(i => i.indexname).join(", "));

  const ext = await sql`SELECT extname, extversion FROM pg_extension WHERE extname = 'vector'`;
  console.log("pgvector:", (ext as { extname: string; extversion: string }[])[0]);
} catch (err) {
  console.error("Migration failed:", err);
  process.exit(1);
} finally {
  await sql.close();
}
