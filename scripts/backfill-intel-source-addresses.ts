/**
 * Sweep every approved intel row, fetch its `sources` URLs, and link any
 * on-chain addresses found in the page text. Backfills attacker / operator
 * wallets that the DefiLlama and REKT feeds don't expose so the imported
 * postmortems actually connect into /graph.
 *
 * Run:
 *   npx tsx scripts/backfill-intel-source-addresses.ts --dry-run
 *   npx tsx scripts/backfill-intel-source-addresses.ts --limit 25
 *   npx tsx scripts/backfill-intel-source-addresses.ts --harvester rekt
 *   npx tsx scripts/backfill-intel-source-addresses.ts                       # all
 *
 * Idempotent: linkAddressesToSubmission upserts on (submission_id,
 * address_id), so re-running adds nothing new and never clobbers a
 * curator-asserted role. Polite to upstream — sleeps `--delay` ms between
 * source fetches (default 300ms) so a sweep doesn't hammer rekt.news.
 *
 * Newest-first, because the recent rows are the ones whose source URLs
 * are still live and the ones most likely to share operators with each
 * other (cluster signature is densest in the last 30 days).
 */
import "dotenv/config";
import { and, desc, eq } from "drizzle-orm";
import { db, submissions } from "../src/lib/db";
import type { IntelPayload } from "../src/lib/db/schema";
import { linkAddressesToSubmission } from "../src/lib/intel-address-extraction";
import { scrapeAddressesFromSources } from "../src/lib/intel-source-address-scrape";

type Args = {
  dryRun: boolean;
  limit: number | null;
  harvester: string | null;
  delayMs: number;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const idxLimit = argv.findIndex((a) => a === "--limit");
  const limit =
    idxLimit >= 0 && argv[idxLimit + 1]
      ? Math.max(1, Number(argv[idxLimit + 1]))
      : null;
  const idxHarv = argv.findIndex((a) => a === "--harvester");
  const harvester =
    idxHarv >= 0 && argv[idxHarv + 1] ? argv[idxHarv + 1] : null;
  const idxDelay = argv.findIndex((a) => a === "--delay");
  const delayMs =
    idxDelay >= 0 && argv[idxDelay + 1]
      ? Math.max(0, Number(argv[idxDelay + 1]))
      : 300;
  return { dryRun, limit, harvester, delayMs };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const args = parseArgs();

  const rows = await db
    .select({
      id: submissions.id,
      publicId: submissions.publicId,
      payload: submissions.payload,
    })
    .from(submissions)
    .where(and(eq(submissions.type, "intel"), eq(submissions.status, "approved")))
    .orderBy(desc(submissions.createdAt));

  const candidates = rows.filter((r) => {
    const p = r.payload as IntelPayload;
    if (!p.sources || p.sources.length === 0) return false;
    if (args.harvester && p.sourceHarvester !== args.harvester) return false;
    return true;
  });

  console.log(
    `Found ${candidates.length} approved intel row(s) with sources` +
      (args.harvester ? ` (harvester=${args.harvester})` : "") +
      (args.limit ? `, processing up to ${args.limit}` : ""),
  );

  let touched = 0;
  let totalLinked = 0;
  let noNew = 0;
  let errored = 0;

  const slice = args.limit ? candidates.slice(0, args.limit) : candidates;
  for (const row of slice) {
    const p = row.payload as IntelPayload;
    process.stdout.write(
      `  · ${row.publicId} "${p.headline.slice(0, 60)}…" → `,
    );

    try {
      const result = await scrapeAddressesFromSources(p);
      const found = result.inputs.length;
      const errs = result.errors.length;

      if (args.dryRun) {
        console.log(
          `${found} address(es) found, ${result.fetched.length} fetched, ${errs} err [dry-run]`,
        );
        continue;
      }

      if (found === 0) {
        console.log(
          `0 addresses ${errs > 0 ? `(${errs} fetch errors)` : "(no hits)"}`,
        );
        noNew++;
      } else {
        const { linked } = await linkAddressesToSubmission(row.id, result.inputs);
        console.log(`${found} found, ${linked} new edge(s)`);
        totalLinked += linked;
        touched++;
      }
    } catch (err) {
      console.log(`[error ${err instanceof Error ? err.message : String(err)}]`);
      errored++;
    }

    if (args.delayMs > 0) await sleep(args.delayMs);
  }

  console.log(
    `\nDone: rows-touched=${touched} new-edges=${totalLinked} no-new=${noNew} errored=${errored} dryRun=${args.dryRun}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
