/**
 * Run the OFAC SDN harvester from the CLI without going through the
 * /api/cron/harvest-ofac route. Useful for local one-shot refreshes of
 * the sanctioned-address dataset (Tornado Cash, Garantex, Sinbad, every
 * Lazarus + DPRK entry) outside the weekly Vercel cron schedule.
 *
 * Run: `npx tsx scripts/harvest-ofac-cli.ts`
 *
 * Idempotent — the harvester upserts on (address_id, source, source_ref)
 * via address_attributions, so re-running adds nothing new and never
 * downgrades curator-asserted attribution.
 */
import "dotenv/config";
import { harvestOfac } from "../src/lib/harvesters/ofac";

async function main() {
  const result = await harvestOfac();
  console.log("OFAC harvest:", JSON.stringify(result, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
