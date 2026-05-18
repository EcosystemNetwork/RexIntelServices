import { and, desc, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import {
  db,
  submissions,
  addresses,
  addressAttributions,
  intelAddresses,
  type IntelPayload,
} from "./db";

/**
 * Context builders for the /expo Gemini demo. Pulls a structured slice of
 * the RexIntel graph + intel corpus that can be flattened into a prompt
 * without leaking the rest of the DB.
 */

export type AddressContext = {
  found: boolean;
  chain: string;
  address: string;
  label: string | null;
  category: string | null;
  ownerName: string | null;
  ownerKind: string | null;
  primarySource: string | null;
  confidence: number | null;
  balanceEstimateUsd: number | null;
  nativeAmount: number | null;
  nativeSymbol: string | null;
  attributions: Array<{
    source: string;
    sourceRef: string | null;
    sourceUrl: string | null;
    label: string | null;
    ownerName: string | null;
    notes: string | null;
    confidence: number | null;
    reportedAt: string | null;
  }>;
  incidents: Array<{
    publicId: string;
    headline: string;
    dek: string | null;
    kind: IntelPayload["kind"] | null;
    severity: IntelPayload["severity"] | null;
    publishedAt: string | null;
    role: string;
  }>;
};

export async function lookupAddressContext(
  chain: string,
  address: string,
): Promise<AddressContext> {
  const chainLower = chain.toLowerCase();
  const addressLower = address.trim().toLowerCase();

  const [row] = await db
    .select()
    .from(addresses)
    .where(
      and(
        eq(addresses.chain, chainLower),
        sql`lower(${addresses.address}) = ${addressLower}`,
      ),
    )
    .limit(1);

  if (!row) {
    return {
      found: false,
      chain: chainLower,
      address: addressLower,
      label: null,
      category: null,
      ownerName: null,
      ownerKind: null,
      primarySource: null,
      confidence: null,
      balanceEstimateUsd: null,
      nativeAmount: null,
      nativeSymbol: null,
      attributions: [],
      incidents: [],
    };
  }

  const attribs = await db
    .select()
    .from(addressAttributions)
    .where(eq(addressAttributions.addressId, row.id))
    .orderBy(desc(addressAttributions.harvestedAt))
    .limit(20);

  const links = await db
    .select({
      submissionId: intelAddresses.submissionId,
      role: intelAddresses.role,
    })
    .from(intelAddresses)
    .where(eq(intelAddresses.addressId, row.id))
    .limit(20);

  const incidents = links.length
    ? await db
        .select({
          id: submissions.id,
          publicId: submissions.publicId,
          payload: submissions.payload,
          publishedAt: submissions.publishedAt,
        })
        .from(submissions)
        .where(
          and(
            inArray(
              submissions.id,
              links.map((l) => l.submissionId),
            ),
            eq(submissions.status, "approved"),
          ),
        )
        .orderBy(desc(submissions.publishedAt))
        .limit(10)
    : [];

  const roleBySubmissionId = new Map<string, string>(
    links.map((l) => [l.submissionId, l.role]),
  );

  return {
    found: true,
    chain: row.chain,
    address: row.address,
    label: row.label,
    category: row.category,
    ownerName: row.ownerName,
    ownerKind: row.ownerKind,
    primarySource: row.primarySource,
    confidence: row.confidence,
    balanceEstimateUsd: row.balanceEstimateUsd
      ? Number(row.balanceEstimateUsd)
      : null,
    nativeAmount: row.nativeAmount ? Number(row.nativeAmount) : null,
    nativeSymbol: row.nativeSymbol,
    attributions: attribs.map((a) => ({
      source: a.source,
      sourceRef: a.sourceRef,
      sourceUrl: a.sourceUrl,
      label: a.label,
      ownerName: a.ownerName,
      notes: a.notes,
      confidence: a.confidence,
      reportedAt: a.reportedAt ? a.reportedAt.toISOString() : null,
    })),
    incidents: incidents.map((i) => {
      const p = i.payload as IntelPayload;
      return {
        publicId: i.publicId,
        headline: p.headline,
        dek: p.dek ?? null,
        kind: p.kind ?? null,
        severity: p.severity ?? null,
        publishedAt: i.publishedAt ? i.publishedAt.toISOString() : null,
        role: roleBySubmissionId.get(i.id) ?? "observed",
      };
    }),
  };
}

export type IntelSnippet = {
  publicId: string;
  headline: string;
  dek: string | null;
  bodyExcerpt: string;
  kind: IntelPayload["kind"] | null;
  severity: IntelPayload["severity"] | null;
  category: string | null;
  publishedAt: string | null;
};

/**
 * Pulls a slice of approved intel for the NL-query endpoint. If `keywords`
 * are supplied (extracted client-side or by Gemini), filter on headline/dek
 * with a case-insensitive contains. Otherwise return the most recent N.
 */
export async function lookupIntelSnippets(
  keywords: string[],
  limit = 25,
): Promise<IntelSnippet[]> {
  const cleaned = keywords
    .map((k) => k.trim())
    .filter((k) => k.length >= 3)
    .slice(0, 4);

  // Match keywords against the JSONB payload's headline/dek/body fields with
  // case-insensitive contains. drizzle's `ilike` only accepts column refs, so
  // we drop to raw SQL for the json-arrow expression.
  const keywordClauses = cleaned.flatMap((k) => {
    const pattern = `%${k}%`;
    return [
      sql`(${submissions.payload}->>'headline') ILIKE ${pattern}`,
      sql`(${submissions.payload}->>'dek') ILIKE ${pattern}`,
      sql`(${submissions.payload}->>'body') ILIKE ${pattern}`,
    ];
  });

  const rows = await db
    .select({
      publicId: submissions.publicId,
      payload: submissions.payload,
      publishedAt: submissions.publishedAt,
    })
    .from(submissions)
    .where(
      keywordClauses.length
        ? and(
            eq(submissions.type, "intel"),
            eq(submissions.status, "approved"),
            or(...keywordClauses),
          )
        : and(eq(submissions.type, "intel"), eq(submissions.status, "approved")),
    )
    .orderBy(desc(submissions.publishedAt))
    .limit(limit);

  return rows.map((r) => {
    const p = r.payload as IntelPayload;
    const body = (p.body ?? "").replace(/\s+/g, " ").trim();
    return {
      publicId: r.publicId,
      headline: p.headline,
      dek: p.dek ?? null,
      bodyExcerpt: body.length > 400 ? body.slice(0, 400) + "…" : body,
      kind: p.kind ?? null,
      severity: p.severity ?? null,
      category: p.category ?? null,
      publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
    };
  });
}

/**
 * Cheap keyword extraction for the NL-query path. Strips stopwords, punctuation
 * and short tokens; preserves any 0x-prefixed hex run (likely an address) and
 * any quoted phrase. Good enough for a stage demo — production would push this
 * through Gemini for proper entity extraction.
 */
const STOPWORDS = new Set([
  "the", "and", "for", "with", "what", "where", "when", "who", "how", "why",
  "from", "into", "about", "show", "list", "find", "give", "tell", "have",
  "has", "had", "did", "does", "was", "were", "are", "any", "all", "this",
  "that", "those", "these", "you", "your", "our", "their", "his", "her",
]);

export function extractKeywords(question: string): string[] {
  const quoted: string[] = [];
  const stripped = question.replace(/"([^"]+)"/g, (_, p) => {
    quoted.push(String(p));
    return " ";
  });
  const tokens = stripped
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
  return [...new Set([...quoted, ...tokens])].slice(0, 6);
}

export type GraphSummary = {
  totalAddresses: number;
  totalIncidents: number;
  totalLostUsd: number;
  topSources: Array<{ source: string; count: number }>;
  topCategories: Array<{ category: string; count: number }>;
};

/**
 * Quick stats block injected into the system prompt so Gemini answers
 * about scope ("how many addresses do you track") factually rather than
 * hallucinating.
 */
export async function getGraphSummary(): Promise<GraphSummary> {
  const [addrCountRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(addresses);
  const totalAddresses = addrCountRow?.n ?? 0;

  const [incidentCountRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(submissions)
    .where(
      and(eq(submissions.type, "intel"), eq(submissions.status, "approved")),
    );
  const totalIncidents = incidentCountRow?.n ?? 0;

  const [lostRow] = await db
    .select({
      total: sql<string>`coalesce(sum(${addresses.balanceEstimateUsd}), 0)`,
    })
    .from(addresses)
    .where(isNotNull(addresses.balanceEstimateUsd));
  const totalLostUsd = Number(lostRow?.total ?? 0);

  const sources = await db
    .select({
      source: addresses.primarySource,
      count: sql<number>`count(*)::int`,
    })
    .from(addresses)
    .where(isNotNull(addresses.primarySource))
    .groupBy(addresses.primarySource)
    .orderBy(sql`count(*) desc`)
    .limit(8);

  const categories = await db
    .select({
      category: addresses.category,
      count: sql<number>`count(*)::int`,
    })
    .from(addresses)
    .where(isNotNull(addresses.category))
    .groupBy(addresses.category)
    .orderBy(sql`count(*) desc`)
    .limit(8);

  return {
    totalAddresses,
    totalIncidents,
    totalLostUsd,
    topSources: sources.map((s) => ({
      source: s.source ?? "unknown",
      count: s.count,
    })),
    topCategories: categories.map((c) => ({
      category: c.category ?? "unknown",
      count: c.count,
    })),
  };
}
