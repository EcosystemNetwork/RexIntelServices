/**
 * Hand-curated operator-wallet clusters → intel_addresses links.
 *
 * Reads data/curated-operator-clusters.json, which lists known attacker
 * wallets (Lazarus, Pink Drainer, GitHub-key sweeper, Ronin operators,
 * etc.) and the incident rows they touched. For each cluster:
 *   1. Upsert every listed address into the `addresses` table with the
 *      curated label (the public attribution string — survives the
 *      defamation guard because it's editorial-set, not user-supplied).
 *   2. Find matching submissions by publicId OR by headlineContains
 *      substring match against approved intel rows.
 *   3. Link the address(es) to every matching submission with the
 *      curated role (typically `subject`).
 *
 * Run:
 *   npx tsx scripts/seed-curated-operator-clusters.ts --dry-run
 *   npx tsx scripts/seed-curated-operator-clusters.ts
 *
 * The point: a single Lazarus operator wallet should fan out across the
 * Bybit / WazirX / DMM Bitcoin / Radiant rows so the public /graph
 * surface reads "this operator hit four protocols" instead of four
 * disconnected nodes. Pairs with scripts/backfill-intel-source-addresses.ts
 * — that handles breadth (every address mentioned in every source),
 * this handles attribution depth (the right address with the right role).
 *
 * Idempotent: linkAddressesToSubmission upserts on PK so re-running
 * preserves curator-asserted roles and never double-counts.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { and, eq, ilike, sql } from "drizzle-orm";
import { db, submissions, addresses } from "../src/lib/db";
import type { AddressRole } from "../src/lib/db/schema";
import { CHAIN_SLUG_SET } from "../src/lib/chains";
import { linkAddressesToSubmission } from "../src/lib/intel-address-extraction";

type ClusterAddress = {
  chain: string;
  address: string;
  role?: AddressRole;
};

type Cluster = {
  operator: string;
  label?: string;
  attribution?: string;
  addresses: ClusterAddress[];
  incidents?: {
    publicIds?: string[];
    headlineContains?: string[];
  };
};

type ClusterFile = {
  clusters: Cluster[];
};

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const path = join(process.cwd(), "data", "curated-operator-clusters.json");
  const raw = readFileSync(path, "utf8");
  const data = JSON.parse(raw) as ClusterFile;

  let upsertedAddresses = 0;
  let linkedEdges = 0;
  let matchedSubmissions = 0;
  let skippedAddresses = 0;
  let skippedClusters = 0;

  for (const cluster of data.clusters ?? []) {
    if (!cluster.addresses || cluster.addresses.length === 0) {
      skippedClusters++;
      console.log(
        `· [skip] "${cluster.operator}" — no addresses listed yet (curator: fill data/curated-operator-clusters.json)`,
      );
      continue;
    }

    // Validate + canonicalize the cluster's addresses.
    const validAddresses: ClusterAddress[] = [];
    for (const a of cluster.addresses) {
      if (!CHAIN_SLUG_SET.has(a.chain)) {
        console.log(
          `  · [skip] chain "${a.chain}" not in SUPPORTED_CHAINS — fix data file`,
        );
        skippedAddresses++;
        continue;
      }
      validAddresses.push({
        chain: a.chain,
        address: a.address,
        role: a.role ?? "subject",
      });
    }
    if (validAddresses.length === 0) {
      skippedClusters++;
      continue;
    }

    // Upsert each address with the cluster's curated label so the
    // public address page renders the attribution chip.
    if (!dryRun) {
      for (const a of validAddresses) {
        const [existing] = await db
          .select({ id: addresses.id, label: addresses.label })
          .from(addresses)
          .where(
            and(
              eq(addresses.chain, a.chain),
              sql`lower(${addresses.address}) = lower(${a.address})`,
            ),
          )
          .limit(1);
        if (existing) {
          // Only stamp the label if the row didn't already carry one — a
          // prior curator pass with a more specific label wins.
          if (!existing.label && cluster.label) {
            await db
              .update(addresses)
              .set({ label: cluster.label })
              .where(eq(addresses.id, existing.id));
          }
        } else {
          await db.insert(addresses).values({
            chain: a.chain,
            address: a.address,
            label: cluster.label ?? null,
          });
          upsertedAddresses++;
        }
      }
    }

    // Find every matching submission by publicId or headline substring.
    const subs = new Map<string, string>(); // id → headline
    for (const pid of cluster.incidents?.publicIds ?? []) {
      const [row] = await db
        .select({ id: submissions.id, payload: submissions.payload })
        .from(submissions)
        .where(
          and(
            eq(submissions.publicId, pid),
            eq(submissions.type, "intel"),
            eq(submissions.status, "approved"),
          ),
        )
        .limit(1);
      if (row) {
        const headline =
          (row.payload as { headline?: string })?.headline ?? "(no headline)";
        subs.set(row.id, headline);
      }
    }
    for (const needle of cluster.incidents?.headlineContains ?? []) {
      const rows = await db
        .select({ id: submissions.id, payload: submissions.payload })
        .from(submissions)
        .where(
          and(
            eq(submissions.type, "intel"),
            eq(submissions.status, "approved"),
            sql`${submissions.payload}->>'headline' ILIKE ${"%" + needle + "%"}`,
          ),
        );
      for (const row of rows) {
        const headline =
          (row.payload as { headline?: string })?.headline ?? "(no headline)";
        subs.set(row.id, headline);
      }
    }

    if (subs.size === 0) {
      console.log(
        `· "${cluster.operator}" → ${validAddresses.length} address(es), 0 matching incidents (yet)`,
      );
      continue;
    }

    console.log(
      `· "${cluster.operator}" → ${validAddresses.length} address(es) × ${subs.size} incident(s):`,
    );
    for (const headline of subs.values()) {
      console.log(`    – ${headline.slice(0, 78)}…`);
    }

    if (dryRun) continue;

    for (const subId of subs.keys()) {
      const { linked } = await linkAddressesToSubmission(
        subId,
        validAddresses.map((a) => ({
          chain: a.chain,
          address: a.address,
          role: (a.role ?? "subject") as AddressRole,
        })),
      );
      linkedEdges += linked;
      matchedSubmissions++;
    }
  }

  console.log(
    `\nDone: clusters=${data.clusters.length} skipped-clusters=${skippedClusters} new-address-rows=${upsertedAddresses} skipped-addresses=${skippedAddresses} touched-submissions=${matchedSubmissions} new-edges=${linkedEdges} dryRun=${dryRun}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
