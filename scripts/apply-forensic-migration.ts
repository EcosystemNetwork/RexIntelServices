/**
 * Run with: npx tsx scripts/apply-forensic-migration.ts
 *
 * One-shot applier for drizzle/0038_forensic_cases.sql. Bypasses drizzle-kit
 * migrate to avoid re-running drifted prior migrations (the journal/file
 * count is ahead of the __drizzle_migrations table). Idempotent because the
 * underlying SQL uses CREATE TABLE/INDEX IF NOT EXISTS.
 */
import "dotenv/config";
import { readFileSync } from "fs";
import { resolve } from "path";
import { Pool, neonConfig } from "@neondatabase/serverless";

if (typeof globalThis.WebSocket === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  neonConfig.webSocketConstructor = require("ws");
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sqlPath = resolve(process.cwd(), "drizzle/0038_forensic_cases.sql");
  const sql = readFileSync(sqlPath, "utf8");

  const pool = new Pool({ connectionString: url });
  try {
    await pool.query(sql);
    console.log("✓ forensic_cases table + indexes applied.");

    // Sanity check
    const r = await pool.query<{ table_name: string; column_count: number }>(
      `select table_name, count(*)::int as column_count
       from information_schema.columns
       where table_schema = 'public' and table_name = 'forensic_cases'
       group by table_name`,
    );
    if (r.rowCount === 0) throw new Error("forensic_cases not present after apply");
    console.log(`✓ ${r.rows[0].table_name} has ${r.rows[0].column_count} columns.`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
