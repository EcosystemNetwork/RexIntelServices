/**
 * Run with: npx tsx scripts/delete-casper-deployer-cluster-row.ts
 *
 * One-off cleanup: removes the standalone Casper Hackathon 2026 deployer-
 * cluster companion intel row (publicId 13945b39790fc8b0). Its content has
 * been folded into the main Casper exposé (publicId 8a751869eb304381) as
 * Gun 8. We're keeping the source seed script in the repo for archival but
 * deleting the live row so the public /intel listing has a single Casper
 * piece rather than two.
 *
 * Idempotent — no-op if the row is already gone.
 */
import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { db, submissions } from "../src/lib/db";

const HEADLINE =
  "Casper Hackathon 2026: one wallet, three 'teams' — operator-cluster receipts from the codebase";

async function main() {
  const existing = await db
    .select({ id: submissions.id, publicId: submissions.publicId })
    .from(submissions)
    .where(eq(sql`${submissions.payload}->>'headline'`, HEADLINE))
    .limit(1);

  if (!existing.length) {
    console.log("No matching row found — nothing to delete.");
    return;
  }

  const row = existing[0];
  await db.delete(submissions).where(eq(submissions.id, row.id));
  console.log(`Deleted companion piece row (id=${row.id}, publicId=${row.publicId})`);
  console.log("Single Casper exposé remaining: /intel/8a751869eb304381");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
