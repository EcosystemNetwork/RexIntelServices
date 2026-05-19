import {
  upsertAttributionsBatch,
  resolveChainAlias,
  type AttributionClaim,
} from "../address-attribution";
import type { AddressAttributionSource } from "../db";

/**
 * OpenSanctions-backed sanctions harvester for non-US lists.
 *
 * OpenSanctions normalizes 100+ sanctions/PEP lists (UK OFSI, EU FSF, UN, CA,
 * AU, JP, CH, KR, SG, etc.) into a unified FollowTheMoney schema. Crypto
 * wallet addresses surface as `CryptoWallet` entities linked to a `holder`
 * (Person or Organization).
 *
 * Endpoint pattern: data.opensanctions.org/datasets/latest/<slug>/entities.ftm.json
 * Format: line-delimited JSON, one entity per line.
 *
 * We use this as a stable, well-maintained mirror rather than scraping each
 * regulator's bespoke XML directly. OFAC is harvested separately from
 * Treasury's primary feed (see harvesters/ofac.ts) because (a) it's the
 * most-cited list and (b) OFAC's native format includes richer
 * SDN-program metadata we want to preserve.
 */

const OPENSANCTIONS_BASE =
  process.env.OPENSANCTIONS_BASE ??
  "https://data.opensanctions.org/datasets/latest";

type FtmEntity = {
  id: string;
  schema: string;
  properties?: Record<string, string[] | undefined>;
  datasets?: string[];
};

export type OpenSanctionsRunInput = {
  /** OpenSanctions dataset slug, e.g. "gb_hmt_sanctions", "eu_fsf". */
  datasetSlug: string;
  /** Which `address_attribution_source` to record for emitted claims. */
  source: AddressAttributionSource;
  /** Stable URL prefix for the regulator's own entity page (optional). */
  sourceUrlBuilder?: (entityId: string) => string;
};

export type OpenSanctionsRunResult = {
  fetchedAt: string;
  datasetSlug: string;
  source: AddressAttributionSource;
  totalEntities: number;
  cryptoWalletEntities: number;
  claimsAttempted: number;
  addressesTouched: number;
  rowsWritten: number;
  unmappedChains: string[];
};

export async function harvestOpenSanctions(
  input: OpenSanctionsRunInput,
): Promise<OpenSanctionsRunResult> {
  const fetchedAt = new Date().toISOString();
  const url = `${OPENSANCTIONS_BASE}/${input.datasetSlug}/entities.ftm.json`;
  const text = await fetchText(url);

  const entitiesById = new Map<string, FtmEntity>();
  let totalEntities = 0;
  let cryptoWalletEntities = 0;

  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let entity: FtmEntity;
    try {
      entity = JSON.parse(line);
    } catch {
      continue;
    }
    totalEntities += 1;
    entitiesById.set(entity.id, entity);
    if (entity.schema === "CryptoWallet") cryptoWalletEntities += 1;
  }

  const claims: AttributionClaim[] = [];
  const unmapped = new Set<string>();

  for (const entity of entitiesById.values()) {
    if (entity.schema !== "CryptoWallet") continue;
    const publicKey = entity.properties?.publicKey?.[0];
    if (!publicKey) continue;

    const currency = entity.properties?.currency?.[0] ?? "";
    const chain =
      resolveChainAlias(currency) ?? inferChainFromAddress(publicKey);
    if (!chain) {
      unmapped.add(currency || "(no currency)");
      continue;
    }

    const holderId = entity.properties?.holder?.[0];
    const holder = holderId ? entitiesById.get(holderId) : undefined;
    const ownerName =
      holder?.properties?.name?.[0] ??
      entity.properties?.alias?.[0] ??
      "(unnamed sanctioned wallet)";
    const ownerKind = mapHolderSchemaToOwnerKind(holder?.schema);
    const noteParts: string[] = [];
    const topics = holder?.properties?.topics ?? [];
    if (topics.length) noteParts.push(`Topics: ${topics.join(", ")}`);
    const sanctionsProgram = holder?.properties?.program?.[0];
    if (sanctionsProgram) noteParts.push(`Program: ${sanctionsProgram}`);

    claims.push({
      chain,
      address: publicKey.trim(),
      source: input.source,
      sourceRef: entity.id,
      sourceUrl: input.sourceUrlBuilder
        ? input.sourceUrlBuilder(entity.id)
        : `https://www.opensanctions.org/entities/${entity.id}/`,
      category: "sanctioned",
      ownerName,
      ownerKind,
      label: ownerName,
      notes: noteParts.join(" | ") || null,
      confidence: 100,
      reportedAt: new Date(),
    });
  }

  const { addressIds, rows } = await upsertAttributionsBatch(claims);

  return {
    fetchedAt,
    datasetSlug: input.datasetSlug,
    source: input.source,
    totalEntities,
    cryptoWalletEntities,
    claimsAttempted: claims.length,
    addressesTouched: addressIds.length,
    rowsWritten: rows,
    unmappedChains: [...unmapped],
  };
}

// Cap each OpenSanctions dataset at 200MB. The largest single dataset is
// the global all-sanctioned NDJSON which sits around 60MB at time of
// writing; the cap is several × headroom. Without it, a runaway redirect
// or a misconfigured proxy could stream into the Vercel function until OOM.
const OPENSANCTIONS_MAX_BYTES = 200 * 1024 * 1024;

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "RexIntel/1.0 (intel graph harvester; https://rexintelservices.com)",
      Accept: "application/json,application/x-ndjson,*/*",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`OpenSanctions fetch failed: ${res.status} ${res.statusText} for ${url}`);
  }
  const reader = res.body?.getReader();
  if (!reader) return res.text();
  let total = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > OPENSANCTIONS_MAX_BYTES) {
        try {
          await reader.cancel();
        } catch {}
        throw new Error(
          `OpenSanctions fetch exceeded ${OPENSANCTIONS_MAX_BYTES} byte cap for ${url}`,
        );
      }
      chunks.push(value);
    }
  }
  return new TextDecoder("utf-8").decode(
    Buffer.concat(chunks.map((c) => Buffer.from(c))),
  );
}

function mapHolderSchemaToOwnerKind(
  schema: string | undefined,
): AttributionClaim["ownerKind"] {
  switch (schema) {
    case "Person":
      return "individual";
    case "Organization":
    case "Company":
    case "LegalEntity":
      return "criminal-group";
    default:
      return "unknown";
  }
}

/**
 * Fallback chain inference for OpenSanctions rows that lack a `currency`
 * tag. Each regex is a coarse first-pass guess — if the addresses table
 * already has a row at (inferred_chain, address), the upsert will dedupe;
 * if not, this is the best we can do without on-chain probes.
 */
function inferChainFromAddress(address: string): string | null {
  const a = address.trim();
  if (/^0x[0-9a-fA-F]{40}$/.test(a)) return "ethereum";
  if (/^(1|3)[a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(a)) return "bitcoin";
  if (/^bc1[ac-hj-np-zAC-HJ-NP-Z02-9]{11,87}$/.test(a)) return "bitcoin";
  if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(a)) return "tron";
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a)) return "solana";
  if (/^L[a-km-zA-HJ-NP-Z1-9]{26,33}$/.test(a)) return "litecoin";
  if (/^4[0-9AB][0-9a-zA-Z]{93}$/.test(a)) return "monero";
  return null;
}
