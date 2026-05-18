import { and, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  addresses,
  addressAttributions,
  type AddressCategory,
  type AddressOwnerKind,
  type AddressAttributionSource,
} from "./db";
import { CHAIN_SLUG_SET } from "./chains";

/**
 * Multi-source address attribution layer. Every harvester (OFAC, OFSI, EU,
 * DefiLlama, curated, community submissions) funnels through `upsertAttribution`
 * so the same address can carry several independent claims while the graph
 * layer reads a single denormalized "primary attribution" per address.
 *
 * Source precedence (descending) governs which claim wins the denormalized
 * slot on the `addresses` row. Authoritative sanctions lists outrank curated
 * lists outrank derivative/community signals.
 */

export const SOURCE_PRECEDENCE: AddressAttributionSource[] = [
  "ofac",
  "ofsi",
  "eu-sanctions",
  "rexintel-curated",
  "etherscan",
  "defillama",
  "incident",
  "rexintel-community",
  // Community-class moat. `victim-trace` ranks above `community-loss-report`
  // because it carries on-chain evidence (recorded hop tx hashes) rather
  // than a self-reported story alone. Both are filtered out of /graph by
  // the "Include user-reported" toggle — same trust class for industry
  // comparison.
  "victim-trace",
  "community-loss-report",
];

const SOURCE_RANK = new Map<AddressAttributionSource, number>(
  SOURCE_PRECEDENCE.map((s, i) => [s, i]),
);

export type AttributionClaim = {
  chain: string;
  address: string;
  source: AddressAttributionSource;
  sourceRef?: string | null;
  sourceUrl?: string | null;
  category?: AddressCategory | null;
  ownerName?: string | null;
  ownerKind?: AddressOwnerKind | null;
  label?: string | null;
  notes?: string | null;
  confidence?: number | null;
  reportedAt?: Date | null;
};

export type UpsertResult = {
  addressId: string;
  inserted: boolean;
  attributionWritten: boolean;
};

/**
 * Idempotent upsert of a single attribution claim. Safe to call repeatedly
 * from cron-driven harvesters — the unique index on
 * (address_id, source, source_ref) with NULLS NOT DISTINCT ensures one row
 * per source claim per address. Returns the address row id so callers can
 * build downstream edges (e.g. linking an attribution to an incident).
 *
 * Eagerly recomputes the denormalized columns on `addresses` — for the
 * single-row callsite (community submissions, one-off curator edits) the
 * extra roundtrip is fine. Batch callers should use upsertAttributionsBatch.
 */
export async function upsertAttribution(
  claim: AttributionClaim,
): Promise<UpsertResult> {
  const addressId = await writeAttribution(claim);
  await recomputeDenormalization(addressId);
  return { addressId, inserted: true, attributionWritten: true };
}

/**
 * Lower-level write: validates, ensures the address row, upserts the
 * attribution, but does NOT recompute the `addresses` denormalized columns.
 * Callers in batch mode collect addressIds and recompute in bulk at end.
 */
async function writeAttribution(claim: AttributionClaim): Promise<string> {
  if (!CHAIN_SLUG_SET.has(claim.chain)) {
    throw new Error(`Unsupported chain: ${claim.chain}`);
  }
  const trimmed = claim.address.trim();
  if (!trimmed) {
    throw new Error("Address required");
  }

  const addressId = await ensureAddressRow(claim.chain, trimmed, claim.label);

  await db
    .insert(addressAttributions)
    .values({
      addressId,
      source: claim.source,
      sourceRef: claim.sourceRef ?? null,
      sourceUrl: claim.sourceUrl ?? null,
      category: claim.category ?? null,
      ownerName: claim.ownerName ?? null,
      ownerKind: claim.ownerKind ?? null,
      label: claim.label ?? null,
      notes: claim.notes ?? null,
      confidence: claim.confidence ?? null,
      reportedAt: claim.reportedAt ?? null,
    })
    .onConflictDoUpdate({
      target: [
        addressAttributions.addressId,
        addressAttributions.source,
        addressAttributions.sourceRef,
      ],
      set: {
        sourceUrl: claim.sourceUrl ?? null,
        category: claim.category ?? null,
        ownerName: claim.ownerName ?? null,
        ownerKind: claim.ownerKind ?? null,
        label: claim.label ?? null,
        notes: claim.notes ?? null,
        confidence: claim.confidence ?? null,
        reportedAt: claim.reportedAt ?? null,
        harvestedAt: new Date(),
      },
    });

  return addressId;
}

/**
 * Bulk variant for harvesters processing thousands of rows. Writes all
 * attributions first, then runs a single end-of-batch denorm sweep over
 * the unique affected address-ids. This is 10-20× faster than the eager
 * per-row recompute path used for single submissions — OFAC went from
 * ~12 minutes to <90 seconds with this change.
 */
export async function upsertAttributionsBatch(
  claims: AttributionClaim[],
  options: { chunkSize?: number } = {},
): Promise<{ addressIds: string[]; rows: number }> {
  const chunkSize = options.chunkSize ?? 200;
  const addressIds = new Set<string>();
  let rows = 0;

  for (const claim of claims) {
    try {
      const id = await writeAttribution(claim);
      addressIds.add(id);
      rows += 1;
    } catch (err) {
      // Skip malformed rows; harvesters log their own counts. Throwing
      // here would abort a long sanctions-list refresh on a single bad
      // entry, which is worse than dropping it.
      console.warn(
        `[address-attribution] skipped claim`,
        { chain: claim.chain, address: claim.address, source: claim.source },
        err instanceof Error ? err.message : err,
      );
    }
    // Yield to event loop every N rows so the cron worker doesn't starve
    // other I/O on large lists.
    if (rows > 0 && rows % chunkSize === 0) {
      await new Promise((r) => setImmediate(r));
    }
  }

  // Single end-of-batch denorm sweep over unique addressIds.
  const uniqueIds = [...addressIds];
  for (const id of uniqueIds) {
    try {
      await recomputeDenormalization(id);
    } catch (err) {
      console.warn(
        `[address-attribution] denorm skipped for ${id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return { addressIds: uniqueIds, rows };
}

/**
 * Pick the highest-precedence attribution that has a category and write its
 * (category, owner_name, owner_kind, primary_source, confidence) to the
 * `addresses` row. Called automatically by upsertAttribution; exposed for
 * one-off recomputes after precedence rules change.
 */
export async function recomputeDenormalization(addressId: string) {
  const rows = await db
    .select({
      source: addressAttributions.source,
      category: addressAttributions.category,
      ownerName: addressAttributions.ownerName,
      ownerKind: addressAttributions.ownerKind,
      label: addressAttributions.label,
      confidence: addressAttributions.confidence,
      reportedAt: addressAttributions.reportedAt,
      harvestedAt: addressAttributions.harvestedAt,
    })
    .from(addressAttributions)
    .where(eq(addressAttributions.addressId, addressId));

  if (rows.length === 0) return;

  // Prefer rows that actually have a category; among those, lowest rank
  // wins (= highest precedence). Tie-break on confidence then recency.
  const ranked = rows
    .filter((r) => r.category != null)
    .sort((a, b) => {
      const ra = SOURCE_RANK.get(a.source) ?? 999;
      const rb = SOURCE_RANK.get(b.source) ?? 999;
      if (ra !== rb) return ra - rb;
      const ca = a.confidence ?? 0;
      const cb = b.confidence ?? 0;
      if (ca !== cb) return cb - ca;
      const ta = (a.reportedAt ?? a.harvestedAt).getTime();
      const tb = (b.reportedAt ?? b.harvestedAt).getTime();
      return tb - ta;
    });

  const winner = ranked[0];
  if (!winner) {
    // No row has a category yet (e.g. only `observed` incident rows). Leave
    // denorm fields null but keep last_verified_at fresh so we know the row
    // has been touched.
    await db
      .update(addresses)
      .set({ lastVerifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(addresses.id, addressId));
    return;
  }

  await db
    .update(addresses)
    .set({
      category: winner.category,
      ownerName: winner.ownerName,
      ownerKind: winner.ownerKind,
      primarySource: winner.source,
      confidence: winner.confidence,
      // Preserve existing label if the winning row didn't supply one (the
      // submit flow may have written a community label first).
      label: winner.label ?? sql`${addresses.label}`,
      lastVerifiedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(addresses.id, addressId));
}

/**
 * Look up or create the addresses row for (chain, address). Case-insensitive
 * match on the unique index. Preserves any existing label/notes — harvesters
 * don't clobber community-contributed context.
 */
async function ensureAddressRow(
  chain: string,
  address: string,
  label: string | null | undefined,
): Promise<string> {
  const [existing] = await db
    .select({ id: addresses.id })
    .from(addresses)
    .where(
      and(
        eq(addresses.chain, chain),
        sql`lower(${addresses.address}) = lower(${address})`,
      ),
    )
    .limit(1);

  if (existing) return existing.id;

  const [inserted] = await db
    .insert(addresses)
    .values({
      chain,
      address,
      label: label ?? null,
      firstSeenAt: new Date(),
    })
    .onConflictDoNothing()
    .returning({ id: addresses.id });

  if (inserted) return inserted.id;

  // Concurrent insert won the race — re-read.
  const [raceRow] = await db
    .select({ id: addresses.id })
    .from(addresses)
    .where(
      and(
        eq(addresses.chain, chain),
        sql`lower(${addresses.address}) = lower(${address})`,
      ),
    )
    .limit(1);

  if (!raceRow) {
    throw new Error(
      `Failed to upsert address row for ${chain}:${address.slice(0, 12)}…`,
    );
  }
  return raceRow.id;
}

/**
 * Bulk-recompute denorm for a set of address ids. Useful when a precedence
 * change ripples across thousands of rows (e.g. adding a new high-priority
 * source).
 */
export async function recomputeMany(addressIds: string[]) {
  for (const id of addressIds) {
    await recomputeDenormalization(id);
  }
}

/**
 * Helper used by the OFAC/OFSI/EU harvesters to map raw sanctions list
 * "DIGITAL CURRENCY" entries onto our chain enum. Each list spells out the
 * currency in slightly different ways (e.g. "XBT", "ETH", "ETHEREUM").
 */
const CHAIN_ALIASES: Record<string, string> = {
  // EVM
  eth: "ethereum",
  ether: "ethereum",
  ethereum: "ethereum",
  weth: "ethereum",
  usdt_eth: "ethereum",
  usdc_eth: "ethereum",
  // OFAC tags sanctioned token-holding wallets by token symbol, not chain.
  // USDT/USDC are predominantly ERC-20 — wallets dedupe on the unique
  // (chain, lower(address)) index, so over-claiming Ethereum is safe.
  usdt: "ethereum",
  usdc: "ethereum",
  // Bitcoin family
  btc: "bitcoin",
  xbt: "bitcoin",
  bitcoin: "bitcoin",
  bch: "bitcoin", // map BCH → bitcoin until we add a slug
  ltc: "litecoin",
  litecoin: "litecoin",
  // Other L1s
  sol: "solana",
  solana: "solana",
  trx: "tron",
  tron: "tron",
  bnb: "bsc",
  bsc: "bsc",
  matic: "polygon",
  polygon: "polygon",
  arb: "arbitrum",
  arbitrum: "arbitrum",
  op: "optimism",
  optimism: "optimism",
  base: "base",
  avax: "avalanche",
  avalanche: "avalanche",
  ton: "ton",
  near: "near",
  sui: "sui",
  apt: "aptos",
  aptos: "aptos",
  atom: "cosmos",
  cosmos: "cosmos",
  xrp: "ripple",
  ripple: "ripple",
  xmr: "monero",
  monero: "monero",
};

export function resolveChainAlias(raw: string): string | null {
  const key = raw.trim().toLowerCase().replace(/[-\s]/g, "_");
  const slug = CHAIN_ALIASES[key];
  if (slug && CHAIN_SLUG_SET.has(slug)) return slug;
  if (CHAIN_SLUG_SET.has(key)) return key;
  return null;
}
