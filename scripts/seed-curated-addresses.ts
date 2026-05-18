/**
 * Seed the curated address graph layer.
 *
 * Run: `npx tsx scripts/seed-curated-addresses.ts`
 *
 * Idempotent — every claim upserts on (address, source, sourceRef). Re-run
 * any time to pick up additions to lib/harvesters/curated-seed.ts.
 */
import "dotenv/config";
import { upsertAttributionsBatch } from "../src/lib/address-attribution";
import { curatedClaims } from "../src/lib/harvesters/curated-seed";

async function main() {
  const claims = curatedClaims();
  console.log(`[seed-curated] upserting ${claims.length} claims…`);
  const { addressIds, rows } = await upsertAttributionsBatch(claims);
  console.log(
    `[seed-curated] done. addresses touched=${addressIds.length}, attribution rows=${rows}`,
  );
}

main().catch((err) => {
  console.error("[seed-curated] failed:", err);
  process.exit(1);
});
