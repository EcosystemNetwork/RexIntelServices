/**
 * Idempotent backfill: sweep every approved intel piece with zero
 * intel_addresses rows, run autoExtractAndLinkIntelAddresses on its payload,
 * and link whatever the extractor finds. Safe to re-run — the PK on
 * intel_addresses + onConflictDoNothing means existing curator-asserted
 * roles are never overwritten.
 *
 * Run: `npx tsx scripts/backfill-intel-address-orphans.ts`
 *
 * Pass `--dry` to print what would change without writing.
 */
import "dotenv/config";
import { and, eq, sql } from "drizzle-orm";
import { db, submissions } from "@/lib/db";
import type { IntelPayload } from "@/lib/db/schema";
import {
  autoExtractAndLinkIntelAddresses,
  extractAddressesFromIntel,
} from "@/lib/intel-address-extraction";

async function main() {
  const dry = process.argv.includes("--dry");

  const orphans = await db
    .select({
      id: submissions.id,
      publicId: submissions.publicId,
      payload: submissions.payload,
    })
    .from(submissions)
    .where(
      and(
        eq(submissions.type, "intel"),
        eq(submissions.status, "approved"),
        sql`not exists (select 1 from intel_addresses where submission_id = ${submissions.id})`,
      ),
    );

  let touched = 0;
  let totalLinked = 0;
  for (const row of orphans) {
    const payload = row.payload as IntelPayload;
    const extracted = extractAddressesFromIntel(payload);
    if (extracted.length === 0) continue;

    if (dry) {
      console.log(
        `[dry] would link ${extracted.length} for ${row.publicId} — "${payload.headline.slice(0, 70)}"`,
      );
      for (const e of extracted) {
        console.log(`        ${e.chain}:${e.address}`);
      }
      touched += 1;
      totalLinked += extracted.length;
      continue;
    }

    const res = await autoExtractAndLinkIntelAddresses(row.id, payload);
    console.log(
      `[backfill] ${row.publicId} extracted=${res.extracted} linked=${res.linked} — "${payload.headline.slice(0, 60)}"`,
    );
    if (res.linked > 0) {
      touched += 1;
      totalLinked += res.linked;
    }
  }

  console.log(
    `\n[backfill] ${dry ? "DRY-RUN " : ""}done: ${touched} intel pieces ${dry ? "would gain" : "gained"} ${totalLinked} new address links across ${orphans.length} scanned orphans.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("[backfill] fatal:", err);
  process.exit(1);
});
