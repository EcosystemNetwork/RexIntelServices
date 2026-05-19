/**
 * Fire OFSI (UK), EU sanctions, and L2Beat harvesters from the CLI. Pairs
 * with [scripts/harvest-ofac-cli.ts](scripts/harvest-ofac-cli.ts) so an
 * operator can refresh the full institutional-address layer locally
 * without waiting on the weekly Vercel crons.
 *
 * Run: `npx tsx scripts/harvest-sanctions-cli.ts`
 *
 * All four harvesters are idempotent — they upsert address_attributions
 * on (address_id, source, source_ref), so re-running adds nothing new
 * and never downgrades curator-asserted attribution.
 */
import "dotenv/config";
import { harvestOpenSanctions } from "../src/lib/harvesters/opensanctions";
import { harvestL2Beat } from "../src/lib/harvesters/l2beat";

async function main() {
  console.log("→ OFSI (UK HMT Sanctions)…");
  const ofsi = await harvestOpenSanctions({
    datasetSlug: "gb_hmt_sanctions",
    source: "ofsi",
    sourceUrlBuilder: (id) => `https://www.opensanctions.org/entities/${id}/`,
  });
  console.log("OFSI:", JSON.stringify(ofsi, null, 2));

  console.log("\n→ EU Sanctions (Consolidated)…");
  const eu = await harvestOpenSanctions({
    datasetSlug: "eu_fsf",
    source: "eu-sanctions",
    sourceUrlBuilder: (id) => `https://www.opensanctions.org/entities/${id}/`,
  });
  console.log("EU:", JSON.stringify(eu, null, 2));

  console.log("\n→ L2Beat (bridge + L2 institutional addresses)…");
  const l2 = await harvestL2Beat();
  console.log("L2Beat:", JSON.stringify(l2, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
