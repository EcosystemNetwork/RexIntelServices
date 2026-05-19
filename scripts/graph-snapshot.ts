/**
 * Print a quick aggregation snapshot of the address graph:
 *   - approved intel row count
 *   - total addresses
 *   - intel-address edge count
 *   - addresses by category (drives /graph filter chip surface area)
 *   - addresses by chain (the value-tracked breakdown)
 *
 * Run: `npx tsx scripts/graph-snapshot.ts`
 *
 * Read-only — never writes. Used to verify seed scripts landed and to
 * baseline before/after for the source-URL backfill passes.
 */
import "dotenv/config";
import { and, eq, sql, isNotNull } from "drizzle-orm";
import { db, submissions, addresses, intelAddresses } from "../src/lib/db";

async function main() {
  const [totalIntel] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(submissions)
    .where(
      and(eq(submissions.type, "intel"), eq(submissions.status, "approved")),
    );
  const [totalAddr] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(addresses);
  const [totalEdges] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(intelAddresses);
  const [withCat] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(addresses)
    .where(isNotNull(addresses.category));
  const byCat = await db
    .select({ c: addresses.category, n: sql<number>`count(*)::int` })
    .from(addresses)
    .where(isNotNull(addresses.category))
    .groupBy(addresses.category)
    .orderBy(sql`count(*) desc`);
  const byChain = await db
    .select({ c: addresses.chain, n: sql<number>`count(*)::int` })
    .from(addresses)
    .groupBy(addresses.chain)
    .orderBy(sql`count(*) desc`);

  console.log("Approved intel rows:", totalIntel.n);
  console.log("Total addresses:", totalAddr.n);
  console.log("Total intel-address edges:", totalEdges.n);
  console.log("Addresses with category:", withCat.n);
  console.log("\nBy category:");
  for (const r of byCat) console.log(`  ${r.c}: ${r.n}`);
  console.log("\nTop chains by address count:");
  for (const r of byChain.slice(0, 10)) console.log(`  ${r.c}: ${r.n}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
