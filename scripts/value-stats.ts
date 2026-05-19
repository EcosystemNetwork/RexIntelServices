/**
 * Print exactly what /graph's ValueCounterBlock displays — totalUsd,
 * priced address count, total addresses, stories total/by-kind, plus
 * top categories and per-token breakdowns. Used to verify whether new
 * seed work shows up in the header counter or only in the raw graph.
 *
 * Run: `npx tsx scripts/value-stats.ts`
 */
import "dotenv/config";
import { fetchValueStats } from "../src/lib/graph-data";

async function main() {
  const stats = await fetchValueStats({ includeUserReported: false });
  console.log("=== /graph header (industry-only mode) ===");
  console.log(
    `Total value tracked:   $${stats.totalUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
  );
  console.log(`Priced addresses:      ${stats.walletCount}`);
  console.log(`Total addresses:       ${stats.addressCount}`);
  console.log(`Stories total:         ${stats.stories.total}`);
  console.log(`  ├─ incidents:        ${stats.stories.incident}`);
  console.log(`  ├─ originals:        ${stats.stories.original}`);
  console.log(`  └─ tips:             ${stats.stories.tip}`);

  if (stats.byCategory.length > 0) {
    console.log("\nBy category (top 8 by USD):");
    for (const b of stats.byCategory.slice(0, 8)) {
      console.log(
        `  ${b.category.padEnd(20)} $${b.totalUsd.toLocaleString(undefined, { maximumFractionDigits: 0 }).padStart(15)} (${b.walletCount} addr)`,
      );
    }
  }

  if (stats.byToken.length > 0) {
    console.log("\nBy token (top 8 by USD):");
    for (const b of stats.byToken.slice(0, 8)) {
      console.log(
        `  ${b.symbol.padEnd(8)} ${b.totalAmount.toLocaleString(undefined, { maximumFractionDigits: 2 }).padStart(20)}  ≈$${b.totalUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}  (${b.walletCount} addr)`,
      );
    }
  }

  const withReports = await fetchValueStats({ includeUserReported: true });
  if (withReports.totalUsd !== stats.totalUsd) {
    console.log("\n=== With +community sources toggle ===");
    console.log(
      `Total value tracked:   $${withReports.totalUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
    );
    console.log(`Priced addresses:      ${withReports.walletCount}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
