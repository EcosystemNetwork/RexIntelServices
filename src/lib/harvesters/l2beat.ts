import {
  upsertAttributionsBatch,
  resolveChainAlias,
  type AttributionClaim,
} from "../address-attribution";

/**
 * L2Beat bridges harvester.
 *
 * Source: L2Beat publishes a JSON projects feed listing every tracked
 * rollup / sidechain / bridge along with the Ethereum L1 contract addresses
 * that hold escrowed funds. Bridges are a critical node-class in the address
 * graph: nearly every cross-chain hack flows through one, and most cefi/defi
 * transfers cross at least one bridge address.
 *
 * STATUS — disabled in cron 2026-05-17. L2Beat's public project-list endpoint
 * (`/api/projects.json`) returns 404 as of this writing; their public API
 * surface has moved to `/api/scaling/summary` (TVL chart only) and per-project
 * routes that don't expose escrow addresses cleanly. Until we identify a
 * stable public source for the contract addresses, bridges are seeded
 * manually via `lib/harvesters/curated-seed.ts`. Override via L2BEAT_API_URL
 * once a working endpoint exists, then re-add the cron entry to vercel.json.
 */

const L2BEAT_URL = process.env.L2BEAT_API_URL ?? "https://l2beat.com/api/projects.json";

type L2BeatProject = {
  id?: string;
  name?: string;
  slug?: string;
  type?: string;
  category?: string;
  // Escrow contracts on Ethereum L1 holding funds for this L2 / bridge.
  escrows?: Array<{
    address?: string;
    chain?: string;
    isHistorical?: boolean;
  }>;
  // Newer schema variants tuck addresses under contracts.
  contracts?: {
    addresses?: Array<{
      address?: string;
      chain?: string;
      name?: string;
    }>;
  };
};

export type L2BeatHarvestResult = {
  fetchedAt: string;
  totalProjects: number;
  addressesEmitted: number;
  claimsAttempted: number;
  addressesTouched: number;
  rowsWritten: number;
  unmappedChains: string[];
};

export async function harvestL2Beat(): Promise<L2BeatHarvestResult> {
  const fetchedAt = new Date().toISOString();
  const res = await fetch(L2BEAT_URL, {
    headers: {
      "User-Agent":
        "RexIntel/1.0 (intel graph harvester; https://rexintelservices.com)",
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`L2Beat fetch failed: ${res.status} ${res.statusText}`);
  }
  const payload = (await res.json()) as
    | L2BeatProject[]
    | { projects: L2BeatProject[] };

  const projects: L2BeatProject[] = Array.isArray(payload)
    ? payload
    : (payload.projects ?? []);

  const claims: AttributionClaim[] = [];
  const unmapped = new Set<string>();
  let addressesEmitted = 0;

  for (const project of projects) {
    if (!project.name) continue;
    const slug = project.slug ?? project.id ?? project.name;
    const isBridge =
      (project.category ?? "").toLowerCase().includes("bridge") ||
      (project.type ?? "").toLowerCase().includes("bridge") ||
      true; // L2 escrows ARE bridges between L1 and the rollup

    const collected: Array<{ address: string; chain: string; name?: string }> =
      [];
    for (const e of project.escrows ?? []) {
      if (e?.address) {
        collected.push({
          address: e.address,
          chain: e.chain ?? "ethereum",
          name: undefined,
        });
      }
    }
    for (const c of project.contracts?.addresses ?? []) {
      if (c?.address) {
        collected.push({
          address: c.address,
          chain: c.chain ?? "ethereum",
          name: c.name,
        });
      }
    }
    if (collected.length === 0) continue;

    for (const row of collected) {
      const chain = resolveChainAlias(row.chain);
      if (!chain) {
        unmapped.add(row.chain);
        continue;
      }
      addressesEmitted += 1;
      claims.push({
        chain,
        address: row.address.trim(),
        source: "rexintel-curated",
        sourceRef: `l2beat:${slug}:${row.address.toLowerCase()}`,
        sourceUrl: `https://l2beat.com/scaling/projects/${slug}`,
        category: isBridge ? "bridge" : "defi-protocol",
        ownerName: row.name ? `${project.name} (${row.name})` : project.name,
        ownerKind: "protocol",
        label: row.name ? `${project.name} – ${row.name}` : project.name,
        notes: `L2Beat tracked: ${project.category ?? project.type ?? "bridge"}`,
        confidence: 95,
        reportedAt: new Date(),
      });
    }
  }

  const { addressIds, rows } = await upsertAttributionsBatch(claims);

  return {
    fetchedAt,
    totalProjects: projects.length,
    addressesEmitted,
    claimsAttempted: claims.length,
    addressesTouched: addressIds.length,
    rowsWritten: rows,
    unmappedChains: [...unmapped],
  };
}
