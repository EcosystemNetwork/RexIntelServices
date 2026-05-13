/**
 * Run with: npx tsx scripts/repair-migration-history.ts
 *
 * Backfills the drizzle.__drizzle_migrations table with one row per
 * entry in drizzle/meta/_journal.json. This repairs the drift caused by
 * earlier use of `db:push` (which applies schema without recording in
 * the migrations log).
 *
 * Hash is sha256(rawFileContent) — exactly what drizzle-orm/migrator.js
 * computes when applying. After this runs, `drizzle-kit migrate` will
 * see all journal entries as applied and won't try to re-create anything.
 *
 * Safe to re-run: the script checks the current hashes before inserting
 * and skips entries that are already recorded.
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "../src/lib/db";

type JournalEntry = {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
};

async function main() {
  const journalPath = path.resolve("drizzle/meta/_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
    version: string;
    dialect: string;
    entries: JournalEntry[];
  };

  // Existing rows so we know what to skip.
  const existing = await db.execute(
    sql`SELECT hash FROM drizzle.__drizzle_migrations`,
  );
  const haveHashes = new Set(
    existing.rows.map((r) => String((r as Record<string, unknown>).hash)),
  );

  let inserted = 0;
  let skipped = 0;

  for (const entry of journal.entries) {
    const sqlPath = path.resolve(`drizzle/${entry.tag}.sql`);
    const content = readFileSync(sqlPath, "utf8");
    const hash = createHash("sha256").update(content).digest("hex");

    if (haveHashes.has(hash)) {
      console.log(`  skip   ${entry.tag} (${hash.slice(0, 12)}…) — already recorded`);
      skipped++;
      continue;
    }

    await db.execute(
      sql`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES (${hash}, ${entry.when})`,
    );
    console.log(`  insert ${entry.tag} (${hash.slice(0, 12)}…) at ${entry.when}`);
    inserted++;
  }

  console.log(
    `\n✓ Migration history repaired: ${inserted} inserted, ${skipped} skipped.`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
