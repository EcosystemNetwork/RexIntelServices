/**
 * Hard-delete stale `rexintel-curated` attribution rows whose seed-file
 * entries have been removed.
 *
 * Why this exists: `seed-curated-addresses.ts` is upsert-only — removing an
 * entry from the file leaves its row sitting in prod with stale data. When
 * the bad row's address is *shared* with a correct attribution (e.g. the
 * Ronin Bridge address was previously double-claimed as "Atomic Wallet"),
 * the wrong claim can still win the denorm tiebreak on recency.
 *
 * Run after any seed cleanup that REMOVES (not just edits) entries. Idempotent
 * — second run no-ops because rows are already gone.
 *
 *   npx tsx scripts/cleanup-stale-attributions.ts --dry-run
 *   npx tsx scripts/cleanup-stale-attributions.ts
 */
import "dotenv/config";
import { and, eq, inArray } from "drizzle-orm";
import { db, addressAttributions } from "../src/lib/db";
import { recomputeDenormalization } from "../src/lib/address-attribution";

/**
 * Source-ref values that were removed from src/lib/harvesters/curated-seed.ts
 * and need their prod rows cleaned up. All sit under source="rexintel-curated".
 *
 * Append here when removing more seed entries — DO NOT rename existing
 * source_refs in the seed file without also adding the old name here.
 */
const STALE_SOURCE_REFS: { source: "rexintel-curated"; sourceRef: string; reason: string }[] = [
  {
    source: "rexintel-curated",
    sourceRef: "atomic-wallet-2023",
    reason: "Address (0x098b716b…) was actually the Ronin Bridge Hacker; no verified Atomic Wallet address known.",
  },
  {
    source: "rexintel-curated",
    sourceRef: "crypto-com-3",
    reason: "Duplicate address of crypto-com-2 (0x46340b20…).",
  },
  {
    source: "rexintel-curated",
    sourceRef: "kyber-2023-hack",
    reason: "Address (0x489a8756…) did not match Etherscan's KyberSwap Exploiter label; correct addresses now seeded as kyberswap-exploiter-1/2.",
  },
  {
    source: "rexintel-curated",
    sourceRef: "ftx-exploit-2022",
    reason: "Address (0x4b8d3a4c…) does not appear in any FTX-hack coverage; repeating-hex pattern suggests it was fabricated. Real FTX Accounts Drainer is at 0x59abf383… (now seeded as ftx-accounts-drainer).",
  },
];

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  console.log(
    `[cleanup-stale-attributions] ${STALE_SOURCE_REFS.length} stale refs to process${dryRun ? " (DRY RUN)" : ""}…`,
  );

  const refs = STALE_SOURCE_REFS.map((r) => r.sourceRef);

  // Single fetch over all candidates so we can preview before any delete.
  const matches = await db
    .select({
      addressId: addressAttributions.addressId,
      source: addressAttributions.source,
      sourceRef: addressAttributions.sourceRef,
      ownerName: addressAttributions.ownerName,
      label: addressAttributions.label,
    })
    .from(addressAttributions)
    .where(
      and(
        eq(addressAttributions.source, "rexintel-curated"),
        inArray(addressAttributions.sourceRef, refs),
      ),
    );

  if (matches.length === 0) {
    console.log("[cleanup-stale-attributions] nothing to delete; prod is already clean.");
    return;
  }

  const reasonMap = new Map(STALE_SOURCE_REFS.map((r) => [r.sourceRef, r.reason]));
  for (const m of matches) {
    console.log(
      `  - ${m.sourceRef} → addressId=${m.addressId} | "${m.label ?? m.ownerName ?? "(no label)"}"`,
    );
    console.log(`    reason: ${reasonMap.get(m.sourceRef ?? "") ?? "(unknown)"}`);
  }

  if (dryRun) {
    console.log(`[cleanup-stale-attributions] dry-run complete, no writes.`);
    return;
  }

  // Hard delete, then recompute denorm for each affected address so the
  // `addresses` row picks the next-best attribution.
  const affectedAddressIds = Array.from(
    new Set(matches.map((m) => m.addressId)),
  );

  const deleted = await db
    .delete(addressAttributions)
    .where(
      and(
        eq(addressAttributions.source, "rexintel-curated"),
        inArray(addressAttributions.sourceRef, refs),
      ),
    )
    .returning({ id: addressAttributions.id });

  console.log(
    `[cleanup-stale-attributions] deleted ${deleted.length} attribution rows across ${affectedAddressIds.length} addresses; recomputing denorm…`,
  );

  for (const id of affectedAddressIds) {
    try {
      await recomputeDenormalization(id);
    } catch (err) {
      console.warn(
        `  denorm skipped for ${id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  console.log(`[cleanup-stale-attributions] done.`);
}

main().catch((err) => {
  console.error("[cleanup-stale-attributions] failed:", err);
  process.exit(1);
});
