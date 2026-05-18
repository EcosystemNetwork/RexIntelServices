/**
 * Run all address-graph harvesters end-to-end.
 *
 * Run: `npx tsx scripts/backfill-address-graph.ts`
 *
 * Each harvester is independent — if one fails, the others continue. Used
 * for initial backfill and ad-hoc full refresh. The same harvesters run
 * on cron in production (see vercel.json).
 */
import "dotenv/config";
import { harvestOfac } from "../src/lib/harvesters/ofac";
import { harvestOpenSanctions } from "../src/lib/harvesters/opensanctions";
import { harvestL2Beat } from "../src/lib/harvesters/l2beat";

async function runOne(label: string, fn: () => Promise<unknown>) {
  console.log(`\n=== ${label} ===`);
  const startedAt = Date.now();
  try {
    const result = await fn();
    console.log(
      `[${label}] ok in ${Date.now() - startedAt}ms`,
      JSON.stringify(result, null, 2),
    );
  } catch (err) {
    console.error(
      `[${label}] FAILED after ${Date.now() - startedAt}ms:`,
      err instanceof Error ? err.message : err,
    );
  }
}

async function main() {
  await runOne("L2Beat bridges", () => harvestL2Beat());
  await runOne("OFAC SDN", () => harvestOfac());
  await runOne("UK OFSI (via OpenSanctions)", () =>
    harvestOpenSanctions({ datasetSlug: "gb_hmt_sanctions", source: "ofsi" }),
  );
  await runOne("EU FSF (via OpenSanctions)", () =>
    harvestOpenSanctions({ datasetSlug: "eu_fsf", source: "eu-sanctions" }),
  );
  console.log("\n[backfill] all harvesters completed.");
}

main().catch((err) => {
  console.error("[backfill] fatal:", err);
  process.exit(1);
});
