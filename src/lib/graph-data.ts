import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db, submissions, addresses, intelAddresses } from "@/lib/db";
import type { IntelPayload } from "@/lib/db/schema";
import { CHAIN_SLUG_SET } from "@/lib/chains";

/**
 * Pure-ish data layer for the public address graph view. Shared by
 * /api/graph (JSON endpoint) and /graph (server-rendered page) so the
 * filter semantics stay in one place.
 *
 * Caps node count at 400 — react-force-graph-2d handles more, but the
 * cognitive load goes vertical past a few hundred and the page loses its
 * point. Past the cap we keep the most-recent incidents and their links.
 */

const NODE_CAP = 400;

export type IncidentNode = {
  id: string;
  kind: "incident";
  publicId: string;
  headline: string;
  severity: IntelPayload["severity"];
  intelKind: IntelPayload["kind"];
  publishedAt: string | null;
  category?: string;
};

export type AddressNode = {
  id: string;
  kind: "address";
  chain: string;
  address: string;
  label: string | null;
};

export type GraphNode = IncidentNode | AddressNode;

export type GraphEdge =
  | {
      kind: "incident-address";
      source: string;
      target: string;
      role: "subject" | "counterparty" | "observed";
    }
  | {
      kind: "address-address";
      source: string;
      target: string;
      weight: number;
    };

export type GraphMeta = {
  window: number | null;
  kind: string;
  chain: string | null;
  nodeCount: number;
  edgeCount: number;
  incidentCount: number;
  addressCount: number;
  generatedAt: string;
};

export type GraphData = {
  meta: GraphMeta;
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export type GraphFilters = {
  window?: string | null;
  kind?: string | null;
  chain?: string | null;
};

export function normalizeFilters(input: GraphFilters): {
  windowDays: number | null;
  kindFilter: Array<IntelPayload["kind"]>;
  kindParam: string;
  chain: string | undefined;
} {
  const windowParam = input.window ?? "90";
  const kindParam = input.kind ?? "incident";
  const chainParam = input.chain ?? undefined;

  const windowDays =
    windowParam === "all"
      ? null
      : Number.isFinite(Number(windowParam))
        ? Math.max(1, Math.min(3650, Number(windowParam)))
        : 90;

  const kindFilter: Array<IntelPayload["kind"]> =
    kindParam === "all"
      ? ["incident", "original"]
      : kindParam === "original"
        ? ["original"]
        : ["incident"];

  const chain =
    chainParam && CHAIN_SLUG_SET.has(chainParam) ? chainParam : undefined;

  return { windowDays, kindFilter, kindParam, chain };
}

export async function fetchGraphData(input: GraphFilters): Promise<GraphData> {
  const { windowDays, kindFilter, kindParam, chain } = normalizeFilters(input);
  const sinceDate =
    windowDays == null
      ? null
      : new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const intelRows = await db
    .select({
      id: submissions.id,
      publicId: submissions.publicId,
      payload: submissions.payload,
      publishedAt: submissions.publishedAt,
    })
    .from(submissions)
    .where(
      sinceDate
        ? and(
            eq(submissions.type, "intel"),
            eq(submissions.status, "approved"),
            gte(submissions.publishedAt, sinceDate),
          )
        : and(
            eq(submissions.type, "intel"),
            eq(submissions.status, "approved"),
          ),
    )
    .orderBy(desc(submissions.publishedAt))
    .limit(NODE_CAP);

  type Picked = (typeof intelRows)[number] & { payload: IntelPayload };
  const candidates = intelRows
    .map((r) => ({ ...r, payload: r.payload as IntelPayload }) as Picked)
    .filter(
      (r) =>
        r.payload.kind != null &&
        (kindFilter as Array<string | undefined>).includes(r.payload.kind),
    );

  if (candidates.length === 0) {
    return {
      meta: {
        window: windowDays,
        kind: kindParam,
        chain: chain ?? null,
        nodeCount: 0,
        edgeCount: 0,
        incidentCount: 0,
        addressCount: 0,
        generatedAt: new Date().toISOString(),
      },
      nodes: [],
      edges: [],
    };
  }

  const linkRows = await db
    .select({
      submissionId: intelAddresses.submissionId,
      addressId: intelAddresses.addressId,
      role: intelAddresses.role,
      chain: addresses.chain,
      address: addresses.address,
      label: addresses.label,
    })
    .from(intelAddresses)
    .innerJoin(addresses, eq(intelAddresses.addressId, addresses.id))
    .where(
      chain
        ? and(
            inArray(
              intelAddresses.submissionId,
              candidates.map((c) => c.id),
            ),
            eq(addresses.chain, chain),
          )
        : inArray(
            intelAddresses.submissionId,
            candidates.map((c) => c.id),
          ),
    );

  const incidentsWithLinks = new Set(linkRows.map((l) => l.submissionId));

  const incidentNodes: IncidentNode[] = candidates
    .filter((c) => incidentsWithLinks.has(c.id))
    .map((c) => ({
      id: `inc:${c.id}`,
      kind: "incident",
      publicId: c.publicId,
      headline: c.payload.headline,
      severity: c.payload.severity,
      intelKind: c.payload.kind,
      publishedAt: c.publishedAt ? c.publishedAt.toISOString() : null,
      category: c.payload.category,
    }));

  const addressNodeById = new Map<string, AddressNode>();
  for (const l of linkRows) {
    if (!addressNodeById.has(l.addressId)) {
      addressNodeById.set(l.addressId, {
        id: `addr:${l.addressId}`,
        kind: "address",
        chain: l.chain,
        address: l.address,
        label: l.label,
      });
    }
  }
  const addressNodes = [...addressNodeById.values()];

  const incidentAddressEdges: GraphEdge[] = linkRows.map((l) => ({
    kind: "incident-address",
    source: `inc:${l.submissionId}`,
    target: `addr:${l.addressId}`,
    role: l.role,
  }));

  const coWeight = new Map<string, number>();
  const submissionToAddrs = new Map<string, string[]>();
  for (const l of linkRows) {
    const arr = submissionToAddrs.get(l.submissionId) ?? [];
    arr.push(l.addressId);
    submissionToAddrs.set(l.submissionId, arr);
  }
  for (const addrs of submissionToAddrs.values()) {
    const uniq = [...new Set(addrs)];
    for (let i = 0; i < uniq.length; i++) {
      for (let j = i + 1; j < uniq.length; j++) {
        const a = uniq[i] < uniq[j] ? uniq[i] : uniq[j];
        const b = uniq[i] < uniq[j] ? uniq[j] : uniq[i];
        const key = `${a}|${b}`;
        coWeight.set(key, (coWeight.get(key) ?? 0) + 1);
      }
    }
  }
  const addressAddressEdges: GraphEdge[] = [...coWeight.entries()].map(
    ([key, weight]) => {
      const [a, b] = key.split("|");
      return {
        kind: "address-address",
        source: `addr:${a}`,
        target: `addr:${b}`,
        weight,
      };
    },
  );

  const nodes: GraphNode[] = [...incidentNodes, ...addressNodes];
  const edges = [...incidentAddressEdges, ...addressAddressEdges];

  return {
    meta: {
      window: windowDays,
      kind: kindParam,
      chain: chain ?? null,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      incidentCount: incidentNodes.length,
      addressCount: addressNodes.length,
      generatedAt: new Date().toISOString(),
    },
    nodes,
    edges,
  };
}
