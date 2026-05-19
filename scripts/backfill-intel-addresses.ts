/**
 * Backfill on-chain addresses for every already-approved intel row.
 *
 * Run: `npx tsx scripts/backfill-intel-addresses.ts`
 *      `npx tsx scripts/backfill-intel-addresses.ts --dry-run`
 *      `npx tsx scripts/backfill-intel-addresses.ts --limit 5`
 *
 * Before this script ran, intel_addresses only contained the addresses the
 * SUBMITTER typed into the structured form on /submit. Articles that put
 * the address in prose (or arrived through DefiLlama / Gemini drafts that
 * curators edited to mention an address) never landed in the public
 * /graph because they had no intel_addresses rows.
 *
 * This script sweeps every approved intel row, runs the same extractor
 * the approval path now uses (extractAddressesFromIntel), and writes the
 * missing intel_addresses links. Idempotent — the PK on
 * (submission_id, address_id) + onConflictDoNothing means re-running
 * does no work and overwrites no curator-asserted roles.
 *
 * Sorted oldest-first so the run order matches the public timeline.
 */
import "dotenv/config";
import { and, asc, eq } from "drizzle-orm";
import { db, submissions } from "../src/lib/db";
import type { IntelPayload } from "../src/lib/db/schema";
import {
  autoExtractAndLinkIntelAddresses,
  extractAddressesFromIntel,
} from "../src/lib/intel-address-extraction";

type Args = { dryRun: boolean; limit: number | null };

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const limitIdx = argv.findIndex((a) => a === "--limit");
  const limit =
    limitIdx >= 0 && argv[limitIdx + 1]
      ? Math.max(1, Number(argv[limitIdx + 1]))
      : null;
  return { dryRun, limit };
}

async function main() {
  const { dryRun, limit } = parseArgs();
  console.log(
    `[backfill-intel-addresses] start · dry-run=${dryRun} · limit=${limit ?? "all"}`,
  );

  const rows = await db
    .select({
      id: submissions.id,
      publicId: submissions.publicId,
      payload: submissions.payload,
      publishedAt: submissions.publishedAt,
    })
    .from(submissions)
    .where(
      and(
        eq(submissions.type, "intel"),
        eq(submissions.status, "approved"),
      ),
    )
    .orderBy(asc(submissions.publishedAt));

  const targets = limit ? rows.slice(0, limit) : rows;
  console.log(
    `[backfill-intel-addresses] scanning ${targets.length} approved intel rows`,
  );

  let totalExtracted = 0;
  let totalLinked = 0;
  let rowsWithHits = 0;

  for (const r of targets) {
    const payload = r.payload as IntelPayload;
    const inputs = extractAddressesFromIntel(payload);
    if (inputs.length === 0) continue;

    rowsWithHits += 1;
    totalExtracted += inputs.length;

    if (dryRun) {
      console.log(
        `[backfill-intel-addresses] [DRY] ${r.publicId} ${payload.headline.slice(0, 60)}`,
      );
      for (const i of inputs) {
        console.log(`  - ${i.chain}:${i.address} (${i.role})`);
      }
      continue;
    }

    try {
      const { linked } = await autoExtractAndLinkIntelAddresses(
        r.id,
        payload,
      );
      totalLinked += linked;
      if (linked > 0) {
        console.log(
          `[backfill-intel-addresses] ${r.publicId} ${payload.headline.slice(0, 60)} → +${linked} new edges (of ${inputs.length} extracted)`,
        );
      }
    } catch (err) {
      console.error(
        `[backfill-intel-addresses] FAILED ${r.publicId}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  console.log(
    `[backfill-intel-addresses] done · rowsScanned=${targets.length} · rowsWithHits=${rowsWithHits} · addressesExtracted=${totalExtracted} · newEdges=${dryRun ? 0 : totalLinked}`,
  );
}

main().catch((err) => {
  console.error("[backfill-intel-addresses] fatal:", err);
  process.exit(1);
});
