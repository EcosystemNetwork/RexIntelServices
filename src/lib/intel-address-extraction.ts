import { and, eq, sql } from "drizzle-orm";
import { db, addresses, intelAddresses } from "@/lib/db";
import type { AddressRole, IntelPayload } from "@/lib/db/schema";
import { CHAIN_SLUG_SET } from "@/lib/chains";

export type AddressInput = {
  chain: string;
  address: string;
  role: AddressRole;
  label?: string;
};

/**
 * Upsert each address into the addresses table and link it to a submission
 * via intel_addresses. Dedupes per (chain, lowercased address). The
 * (submission_id, address_id) primary key on intel_addresses + onConflict-
 * DoNothing means a re-run preserves whatever role a curator previously set.
 *
 * Free-form user `label` is NOT promoted to addresses.label — that's the
 * defamation guard: addresses.label renders as the H1 on the public address
 * page and can only be set by curator-side tooling or harvester attribution.
 *
 * Returns { linked } = the number of (submission, address) edges newly
 * created on this call so callers can log "auto-extracted N addresses".
 */
export async function linkAddressesToSubmission(
  submissionId: string,
  inputs: AddressInput[],
): Promise<{ linked: number }> {
  let linked = 0;
  for (const input of inputs) {
    const [existing] = await db
      .select({ id: addresses.id })
      .from(addresses)
      .where(
        and(
          eq(addresses.chain, input.chain),
          sql`lower(${addresses.address}) = lower(${input.address})`,
        ),
      )
      .limit(1);

    let addressId = existing?.id;
    if (!addressId) {
      const [inserted] = await db
        .insert(addresses)
        .values({
          chain: input.chain,
          address: input.address,
          label: null,
        })
        .onConflictDoNothing()
        .returning({ id: addresses.id });
      if (inserted) {
        addressId = inserted.id;
      } else {
        const [raceRow] = await db
          .select({ id: addresses.id })
          .from(addresses)
          .where(
            and(
              eq(addresses.chain, input.chain),
              sql`lower(${addresses.address}) = lower(${input.address})`,
            ),
          )
          .limit(1);
        addressId = raceRow?.id;
      }
    }

    if (!addressId) continue;

    const inserted = await db
      .insert(intelAddresses)
      .values({
        submissionId,
        addressId,
        role: input.role,
      })
      .onConflictDoNothing()
      .returning({ submissionId: intelAddresses.submissionId });

    if (inserted.length > 0) linked += 1;
  }
  return { linked };
}

// =====================================================================
// AUTO-EXTRACTION
//
// On approval, sweep the intel payload for on-chain addresses so they land
// in the public graph automatically. Two extraction lanes:
//   1. Explorer URLs in links/sources — gives us a high-confidence chain
//      hint (polygonscan → polygon, basescan → base, mempool → bitcoin).
//   2. Bare addresses in body/dek/headline — prose sweep. Only patterns
//      with a strong prefix are scanned (0x for EVM, bc1/ltc1 for bech32).
//      Bare BTC base58 / Solana base58 are NOT scanned in prose because
//      the alphabets are too lenient to apply to free text without false
//      positives (random alphanumeric tokens, abbreviated hashes, etc.).
//      They still land via the explorer-URL lane.
//
// Chain disambiguation: an EVM 0x literal could be on ethereum / base /
// arbitrum / etc. — the literal alone doesn't say. If an explorer URL
// elsewhere in the same payload typed the same address, we adopt that
// chain. Otherwise we default to "ethereum" — the chain most readers
// assume when prose doesn't specify. Curators can re-chain later via the
// admin UI; the auto-extracted row is always added with role="observed"
// so a curator-supplied subject/counterparty role is never overwritten
// (PK onConflictDoNothing in linkAddressesToSubmission).
// =====================================================================

type Extracted = { chain: string; address: string };

// Strict EVM address: 0x + exactly 40 hex chars, NOT bordered by other hex
// (so we don't slice into the middle of a 64-char tx hash).
const EVM_ADDR_RE =
  /(?<![0-9a-fA-F])0x[a-fA-F0-9]{40}(?![0-9a-fA-F])/g;

// Bech32 native segwit / taproot for BTC + LTC. Minimum 38 char body keeps
// us above the shortest legitimate P2WPKH while staying below the maximum
// P2TR length. Lower-case only per BIP-173.
const BTC_BECH32_RE = /\bbc1[a-z0-9]{38,87}\b/g;
const LTC_BECH32_RE = /\bltc1[a-z0-9]{38,87}\b/g;

// EVM explorer host → chain slug. Used by extractFromUrl to type an
// extracted 0x address based on the explorer it appeared on.
const EVM_EXPLORERS: Array<{ host: RegExp; chain: string }> = [
  // optimistic.etherscan.io must beat etherscan.io — match longer hosts first.
  { host: /optimistic\.etherscan\.io/i, chain: "optimism" },
  { host: /polygonscan\.com/i, chain: "polygon" },
  { host: /bscscan\.com/i, chain: "bsc" },
  { host: /arbiscan\.io/i, chain: "arbitrum" },
  { host: /basescan\.org/i, chain: "base" },
  { host: /snowtrace\.io/i, chain: "avalanche" },
  { host: /ftmscan\.com/i, chain: "other" }, // Fantom — not in SUPPORTED_CHAINS
  { host: /etherscan\.io/i, chain: "ethereum" },
];

/**
 * Pull a typed (chain, address) pair out of a single URL when it points at
 * a public explorer's address page. Returns null when the URL isn't an
 * explorer address page or the chain isn't in our allow-list.
 */
function extractFromUrl(url: string): Extracted | null {
  // EVM explorers: hostname → chain, then /address/0x... or /token/0x...
  for (const { host, chain } of EVM_EXPLORERS) {
    if (!host.test(url)) continue;
    const m = url.match(/(?:address|token)\/(0x[a-fA-F0-9]{40})/i);
    if (m && CHAIN_SLUG_SET.has(chain)) {
      return { chain, address: m[1].toLowerCase() };
    }
  }

  // BTC explorers — bech32 OR base58 path. Restricted to known hosts so
  // we don't false-positive on random `/address/<token>` URLs.
  let m = url.match(/(?:mempool\.space|blockchain\.com\/btc|blockchair\.com\/bitcoin)\/address\/([A-Za-z0-9]+)/i);
  if (m) return { chain: "bitcoin", address: m[1] };

  // Solana
  m = url.match(/solscan\.io\/(?:account|address)\/([1-9A-HJ-NP-Za-km-z]{32,44})/i);
  if (m) return { chain: "solana", address: m[1] };
  m = url.match(/explorer\.solana\.com\/address\/([1-9A-HJ-NP-Za-km-z]{32,44})/i);
  if (m) return { chain: "solana", address: m[1] };

  // Tron
  m = url.match(/tronscan\.(?:org|io)\/(?:#\/)?address\/([A-Za-z0-9]+)/i);
  if (m) return { chain: "tron", address: m[1] };

  // TON
  m = url.match(/tonscan\.org\/address\/([A-Za-z0-9_-]+)/i);
  if (m) return { chain: "ton", address: m[1] };
  m = url.match(/tonviewer\.com\/([A-Za-z0-9_-]{20,})/i);
  if (m) return { chain: "ton", address: m[1] };

  // Ripple
  m = url.match(/xrpscan\.com\/account\/(r[1-9A-HJ-NP-Za-km-z]{24,34})/i);
  if (m) return { chain: "ripple", address: m[1] };

  return null;
}

/**
 * Sweep prose text for bare EVM (0x) and bech32 (bc1 / ltc1) addresses.
 * No chain hint — caller is responsible for assigning a chain (typically
 * defaulting EVM to ethereum unless an explorer URL already typed it).
 */
function extractFromText(text: string): Array<{ kind: "evm" | "btc-bech32" | "ltc-bech32"; address: string }> {
  const out: Array<{ kind: "evm" | "btc-bech32" | "ltc-bech32"; address: string }> = [];
  EVM_ADDR_RE.lastIndex = 0;
  for (const m of text.matchAll(EVM_ADDR_RE)) {
    out.push({ kind: "evm", address: m[0].toLowerCase() });
  }
  BTC_BECH32_RE.lastIndex = 0;
  for (const m of text.matchAll(BTC_BECH32_RE)) {
    out.push({ kind: "btc-bech32", address: m[0] });
  }
  LTC_BECH32_RE.lastIndex = 0;
  for (const m of text.matchAll(LTC_BECH32_RE)) {
    out.push({ kind: "ltc-bech32", address: m[0] });
  }
  return out;
}

/**
 * Extract every on-chain address mentioned in an intel payload. Returns
 * AddressInput rows ready for linkAddressesToSubmission — role is always
 * "observed" since this is auto-extracted, not curator-asserted.
 *
 * Dedupe key is (chain, lowercased EVM | as-is BTC/SOL/etc). Explorer-URL
 * typed extractions beat prose defaults: if `0xABC` appears on a
 * polygonscan URL AND in body prose, we emit one row chain=polygon
 * instead of two (one polygon, one ethereum).
 */
export function extractAddressesFromIntel(
  payload: IntelPayload,
): AddressInput[] {
  // Phase 1: walk every URL we know about — explorer URLs carry chain info.
  const typedByAddress = new Map<string, Extracted>(); // key = lowercase address
  const urlCandidates: string[] = [];
  if (payload.links) urlCandidates.push(...payload.links);
  if (payload.sources) urlCandidates.push(...payload.sources);
  if (payload.archiveUrl) urlCandidates.push(payload.archiveUrl);
  // Body can also contain raw URLs; the same extractor handles them.
  if (payload.body) {
    const bodyUrls = payload.body.match(/https?:\/\/\S+/gi) ?? [];
    urlCandidates.push(...bodyUrls);
  }
  for (const raw of urlCandidates) {
    const e = extractFromUrl(raw);
    if (!e) continue;
    const key = e.address.toLowerCase();
    // First typed hit wins. If a later URL types the same address with a
    // different chain, we keep the first (rare; curator can fix).
    if (!typedByAddress.has(key)) typedByAddress.set(key, e);
  }

  // Phase 2: prose sweep. EVM defaults to ethereum unless URL-typed above.
  const proseText = [
    payload.headline,
    payload.dek ?? "",
    payload.body ?? "",
  ].join("\n");
  const proseHits = extractFromText(proseText);
  const proseByKey = new Map<string, Extracted>(); // key = `${chain}:${lower(address)}`
  for (const hit of proseHits) {
    if (hit.kind === "evm") {
      const lower = hit.address.toLowerCase();
      const typed = typedByAddress.get(lower);
      // If an explorer URL already typed this 0x to a specific chain,
      // adopt that chain instead of guessing ethereum.
      const chain = typed?.chain ?? "ethereum";
      proseByKey.set(`${chain}:${lower}`, { chain, address: lower });
    } else if (hit.kind === "btc-bech32") {
      proseByKey.set(`bitcoin:${hit.address}`, {
        chain: "bitcoin",
        address: hit.address,
      });
    } else if (hit.kind === "ltc-bech32") {
      proseByKey.set(`litecoin:${hit.address}`, {
        chain: "litecoin",
        address: hit.address,
      });
    }
  }

  // Merge: union of (typed-by-URL) ∪ (prose-with-chain-resolved). Same-
  // address dedupe is handled by the Map key.
  const merged = new Map<string, Extracted>();
  for (const e of typedByAddress.values()) {
    merged.set(`${e.chain}:${e.address.toLowerCase()}`, e);
  }
  for (const e of proseByKey.values()) {
    const key = `${e.chain}:${e.address.toLowerCase()}`;
    if (!merged.has(key)) merged.set(key, e);
  }

  // Defensive: never emit a row for a chain outside the allow-list, even
  // if an explorer URL pointed there. Keeps the addresses table clean.
  return [...merged.values()]
    .filter((e) => CHAIN_SLUG_SET.has(e.chain))
    .map((e) => ({
      chain: e.chain,
      address: e.address,
      role: "observed" as const,
    }));
}

/**
 * One-shot helper: extract every address mentioned in an intel payload and
 * link them all to the submission. Called from the approval paths (single +
 * bulk review) and from harvesters that insert directly as `approved`.
 *
 * Safe to call multiple times for the same submission — the PK conflict on
 * intel_addresses means we never overwrite a curator-asserted role and
 * never double-count edges.
 *
 * Chain-collision guard: before we link anything, we read the submission's
 * existing intel_addresses rows. If the curator already linked an EVM 0x
 * address as chain=polygon (or base, etc.), and our prose-extractor would
 * default the same literal to chain=ethereum, we drop the ethereum guess.
 * This keeps the graph from gaining a duplicate node for the same on-chain
 * entity just because prose mentioned it bare. Explorer-URL-typed
 * extractions are NOT suppressed — those carry a confident chain.
 */
export async function autoExtractAndLinkIntelAddresses(
  submissionId: string,
  payload: IntelPayload,
): Promise<{ extracted: number; linked: number }> {
  const extracted = extractAddressesFromIntel(payload);
  if (extracted.length === 0) return { extracted: 0, linked: 0 };

  const existingLinks = await db
    .select({
      chain: addresses.chain,
      address: addresses.address,
    })
    .from(intelAddresses)
    .innerJoin(addresses, eq(intelAddresses.addressId, addresses.id))
    .where(eq(intelAddresses.submissionId, submissionId));

  // Build a set of `lower(address)` for which the submission already has a
  // link on SOME chain. Used to suppress prose-default ethereum guesses
  // when the curator already chose a different chain for the same literal.
  const linkedByLowerAddress = new Set(
    existingLinks.map((l) => l.address.toLowerCase()),
  );
  // Exact (chain, address) hits — for short-circuit dedupe, since the
  // linker's onConflictDoNothing would no-op anyway but we save a query.
  const linkedExact = new Set(
    existingLinks.map((l) => `${l.chain}:${l.address.toLowerCase()}`),
  );

  const filtered = extracted.filter((e) => {
    const lower = e.address.toLowerCase();
    const exactKey = `${e.chain}:${lower}`;
    if (linkedExact.has(exactKey)) return false;
    // Suppress ethereum-default for an EVM literal the curator linked to a
    // different chain. Non-EVM (BTC/SOL/etc.) extractions, and any EVM
    // extraction NOT chained to ethereum (i.e. it was typed by an explorer
    // URL like polygonscan), pass through.
    if (
      e.chain === "ethereum" &&
      lower.startsWith("0x") &&
      linkedByLowerAddress.has(lower)
    ) {
      return false;
    }
    return true;
  });

  if (filtered.length === 0) return { extracted: extracted.length, linked: 0 };
  const { linked } = await linkAddressesToSubmission(submissionId, filtered);
  return { extracted: extracted.length, linked };
}
