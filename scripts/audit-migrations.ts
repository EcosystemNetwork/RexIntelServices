import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { db } from "../src/lib/db";
import { sql } from "drizzle-orm";

type DbRow = { id: number; hash: string; created_at: string };

// Drizzle's migration hash is sha256 of the .sql file's TEXT (UTF-8),
// statement-by-statement: it splits on `--> statement-breakpoint`, joins
// with `\n` separators, then hashes. For ALTER TYPE-only migrations the
// shape is the same — no breakpoint, the whole file is one statement.
//
// Source: https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-kit/src/utils.ts
function drizzleHash(sqlText: string): string {
  const statements = sqlText
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const joined = statements.join("\n");
  return createHash("sha256").update(joined).digest("hex");
}

async function main() {
  const drizzleDir = join(process.cwd(), "drizzle");
  const sqlFiles = readdirSync(drizzleDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const snapshotFiles = readdirSync(join(drizzleDir, "meta"))
    .filter((f) => f.endsWith("_snapshot.json"))
    .sort();
  const journal = JSON.parse(
    readFileSync(join(drizzleDir, "meta", "_journal.json"), "utf8"),
  ) as { entries: { idx: number; tag: string; when: number }[] };

  const dbRows = (await db.execute(
    sql`SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id`,
  )) as unknown as { rows: DbRow[] };

  const dbHashes = new Map<string, DbRow>();
  for (const r of dbRows.rows) dbHashes.set(r.hash, r);

  console.log("=== ON DISK ===");
  for (const f of sqlFiles) {
    const tag = f.replace(/\.sql$/, "");
    const idx = Number(tag.split("_")[0]);
    const sqlText = readFileSync(join(drizzleDir, f), "utf8");
    const hash = drizzleHash(sqlText);
    const snapshotPresent = snapshotFiles.includes(`${String(idx).padStart(4, "0")}_snapshot.json`);
    const journalEntry = journal.entries.find((e) => e.tag === tag);
    const dbRow = dbHashes.get(hash);
    console.log(
      `  ${tag.padEnd(40)}  snap=${snapshotPresent ? "Y" : "N"}  journal=${journalEntry ? "Y" : "N"}  db=${dbRow ? `Y(id=${dbRow.id})` : "N"}  hash=${hash.slice(0, 12)}`,
    );
  }

  console.log("\n=== ORPHAN DB ROWS (hash not on disk) ===");
  const onDiskHashes = new Set(
    sqlFiles.map((f) =>
      drizzleHash(readFileSync(join(drizzleDir, f), "utf8")),
    ),
  );
  for (const r of dbRows.rows) {
    if (!onDiskHashes.has(r.hash)) {
      console.log(`  id=${r.id}  hash=${r.hash.slice(0, 12)}  created_at=${r.created_at}`);
    }
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
