import { cache } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  db,
  submissions,
  addresses,
  addressAttributions,
  intelAddresses,
} from "@/lib/db";
import type {
  IntelPayload,
  AddressRole,
  AddressCategory,
  AddressOwnerKind,
  AddressAttributionSource,
} from "@/lib/db/schema";
import { PublicShell } from "@/components/public-shell";
import { JsonLd } from "@/components/json-ld";
import { CHAIN_SLUG_SET, explorerUrl, SUPPORTED_CHAINS } from "@/lib/chains";
import { absoluteUrl } from "@/lib/site-url";
import { detailHref } from "@/lib/slug";

export const dynamic = "force-dynamic";

type LinkedIntel = {
  publicId: string;
  payload: IntelPayload;
  role: AddressRole;
  publishedAt: Date | null;
  submitterHandle: string | null;
};

type AttributionRow = {
  source: AddressAttributionSource;
  sourceRef: string | null;
  sourceUrl: string | null;
  category: AddressCategory | null;
  ownerName: string | null;
  ownerKind: AddressOwnerKind | null;
  label: string | null;
  notes: string | null;
  confidence: number | null;
  reportedAt: Date | null;
  harvestedAt: Date;
};

type LoadedEntity = {
  id: string;
  chain: string;
  address: string;
  label: string | null;
  notes: string | null;
  category: AddressCategory | null;
  ownerName: string | null;
  ownerKind: AddressOwnerKind | null;
  primarySource: AddressAttributionSource | null;
  confidence: number | null;
  balanceEstimateUsd: string | null;
  firstSeenAt: Date | null;
  lastVerifiedAt: Date | null;
  attributions: AttributionRow[];
  intel: LinkedIntel[];
};

const loadEntity = cache(
  async (chain: string, address: string): Promise<LoadedEntity | undefined> => {
    if (!CHAIN_SLUG_SET.has(chain)) return undefined;
    const [row] = await db
      .select({
        id: addresses.id,
        chain: addresses.chain,
        address: addresses.address,
        label: addresses.label,
        notes: addresses.notes,
        category: addresses.category,
        ownerName: addresses.ownerName,
        ownerKind: addresses.ownerKind,
        primarySource: addresses.primarySource,
        confidence: addresses.confidence,
        balanceEstimateUsd: addresses.balanceEstimateUsd,
        firstSeenAt: addresses.firstSeenAt,
        lastVerifiedAt: addresses.lastVerifiedAt,
      })
      .from(addresses)
      .where(
        and(
          eq(addresses.chain, chain),
          sql`lower(${addresses.address}) = lower(${address})`,
        ),
      )
      .limit(1);
    if (!row) return undefined;

    const attributionRows = await db
      .select({
        source: addressAttributions.source,
        sourceRef: addressAttributions.sourceRef,
        sourceUrl: addressAttributions.sourceUrl,
        category: addressAttributions.category,
        ownerName: addressAttributions.ownerName,
        ownerKind: addressAttributions.ownerKind,
        label: addressAttributions.label,
        notes: addressAttributions.notes,
        confidence: addressAttributions.confidence,
        reportedAt: addressAttributions.reportedAt,
        harvestedAt: addressAttributions.harvestedAt,
      })
      .from(addressAttributions)
      .where(eq(addressAttributions.addressId, row.id))
      .orderBy(desc(addressAttributions.harvestedAt));

    const intelRows = await db
      .select({
        publicId: submissions.publicId,
        payload: submissions.payload,
        role: intelAddresses.role,
        publishedAt: submissions.publishedAt,
        submitterHandle: submissions.submitterHandle,
      })
      .from(intelAddresses)
      .innerJoin(submissions, eq(intelAddresses.submissionId, submissions.id))
      .where(
        and(
          eq(intelAddresses.addressId, row.id),
          eq(submissions.status, "approved"),
          eq(submissions.type, "intel"),
        ),
      )
      .orderBy(desc(submissions.publishedAt))
      .limit(200);

    return {
      ...row,
      attributions: attributionRows,
      intel: intelRows.map((r) => ({
        publicId: r.publicId,
        payload: r.payload as IntelPayload,
        role: r.role,
        publishedAt: r.publishedAt,
        submitterHandle: r.submitterHandle,
      })),
    };
  },
);

const ROLE_LABEL: Record<AddressRole, string> = {
  subject: "Subject",
  counterparty: "Counterparty",
  observed: "Observed",
};

const ROLE_TONE: Record<AddressRole, { bg: string; fg: string; border: string }> = {
  subject: {
    bg: "rgba(248,113,113,0.10)",
    fg: "#f87171",
    border: "rgba(248,113,113,0.30)",
  },
  counterparty: {
    bg: "rgba(251,191,36,0.10)",
    fg: "var(--rex-warning)",
    border: "rgba(251,191,36,0.30)",
  },
  observed: {
    bg: "rgba(136,136,160,0.10)",
    fg: "var(--rex-text-muted)",
    border: "rgba(136,136,160,0.25)",
  },
};

function chainLabel(slug: string): string {
  return SUPPORTED_CHAINS.find((c) => c.slug === slug)?.label ?? slug;
}

function truncateAddress(addr: string, head = 8, tail = 6): string {
  if (addr.length <= head + tail + 3) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

const SOURCE_LABEL: Record<AddressAttributionSource, string> = {
  ofac: "OFAC SDN",
  ofsi: "UK OFSI",
  "eu-sanctions": "EU FSF",
  defillama: "DefiLlama",
  "rexintel-curated": "RexIntel (curated)",
  "rexintel-community": "RexIntel (community)",
  etherscan: "Etherscan label",
  incident: "Intel incident",
  "community-loss-report": "User-reported loss",
  "victim-trace": "Victim trace (on-chain)",
  "bounty-claim": "Bounty claim (accepted)",
};

const SOURCE_TONE: Record<AddressAttributionSource, { bg: string; fg: string }> = {
  ofac: { bg: "rgba(239,68,68,0.12)", fg: "#fca5a5" },
  ofsi: { bg: "rgba(239,68,68,0.12)", fg: "#fca5a5" },
  "eu-sanctions": { bg: "rgba(239,68,68,0.12)", fg: "#fca5a5" },
  defillama: { bg: "rgba(20,184,166,0.10)", fg: "#5eead4" },
  "rexintel-curated": {
    bg: "rgba(95,185,31,0.12)",
    fg: "var(--rex-accent)",
  },
  "rexintel-community": {
    bg: "rgba(31,168,224,0.10)",
    fg: "var(--rex-accent-2)",
  },
  etherscan: { bg: "rgba(168,85,247,0.10)", fg: "#c4b5fd" },
  incident: { bg: "rgba(251,191,36,0.10)", fg: "var(--rex-warning)" },
  // Distinct muted-amber to telegraph "unverified — submitter testimony."
  // Dimmer than `incident` so a viewer scanning the page reads it as the
  // weakest claim on the address.
  "community-loss-report": {
    bg: "rgba(251,191,36,0.06)",
    fg: "#fbbf24aa",
  },
  // Slightly brighter than the self-report variant because victim-trace
  // carries an on-chain receipt (tx hash recorded in hack_trace_hops).
  "victim-trace": {
    bg: "rgba(251,191,36,0.10)",
    fg: "#fbbf24",
  },
  // Accepted bounty claim — curator + victim ack on top of on-chain evidence,
  // so brightest of the community-class sources. Greener tint to telegraph
  // "white-hat verified" vs. raw self-reported amber.
  "bounty-claim": {
    bg: "rgba(95,185,31,0.10)",
    fg: "#86efac",
  },
};

const CATEGORY_LABEL: Record<AddressCategory, string> = {
  exchange: "Exchange",
  "defi-protocol": "DeFi protocol",
  treasury: "DAO treasury",
  foundation: "Foundation",
  bridge: "Bridge",
  mixer: "Mixer",
  sanctioned: "Sanctioned",
  "government-seized": "Govt. seized",
  lost: "Lost",
  dormant: "Dormant",
  "hack-source": "Hack source",
  "hack-destination": "Hack destination",
  validator: "Validator",
  personality: "Personality",
  "market-maker": "Market maker",
  "mev-bot": "MEV bot",
  scam: "Scam",
};

function formatUsdShort(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export async function generateMetadata({
  params,
}: {
  params: { chain: string; address: string };
}): Promise<Metadata> {
  const entity = await loadEntity(params.chain, params.address);
  if (!entity) {
    return { title: "Entity not found — Rex Intel Services" };
  }
  const ref = entity.label
    ? `${entity.label} (${chainLabel(entity.chain)})`
    : `${chainLabel(entity.chain)} ${truncateAddress(entity.address)}`;
  return {
    title: `${ref} — Rex Intel Services`,
    description: `${entity.intel.length} intel ${
      entity.intel.length === 1 ? "report" : "reports"
    } reference this address on Rex Intel Services.`,
    alternates: { canonical: `/intel/address/${entity.chain}/${entity.address}` },
  };
}

export default async function EntityPage({
  params,
}: {
  params: { chain: string; address: string };
}) {
  const entity = await loadEntity(params.chain, params.address);
  if (!entity) notFound();

  const explorer = explorerUrl(entity.chain, entity.address);
  const counts = entity.intel.reduce(
    (acc, r) => {
      acc[r.role] = (acc[r.role] ?? 0) + 1;
      return acc;
    },
    { subject: 0, counterparty: 0, observed: 0 } as Record<AddressRole, number>,
  );

  const canonicalUrl = absoluteUrl(
    `/intel/address/${entity.chain}/${entity.address}`,
  );

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Thing",
    name: entity.label ?? `${entity.chain}:${entity.address}`,
    identifier: `${entity.chain}:${entity.address}`,
    description: entity.notes ?? undefined,
    url: canonicalUrl,
    sameAs: explorer ? [explorer] : undefined,
    subjectOf: entity.intel.length
      ? entity.intel.map((r) => ({
          "@type": "NewsArticle",
          headline: r.payload.headline,
          url: absoluteUrl(detailHref("/intel", r.publicId, r.payload.headline)),
          datePublished: r.publishedAt?.toISOString(),
        }))
      : undefined,
  };

  return (
    <PublicShell
      classification={[{ text: "● Open Channel // Entity Graph" }]}
    >
      <JsonLd data={jsonLd} />
      <main className="max-w-3xl mx-auto px-6 pt-8 md:pt-12 pb-24">
        <Link
          href="/intel"
          className="mono-label hover:text-[var(--rex-text)] transition-colors inline-flex items-center gap-1.5 mb-6"
        >
          <span>←</span>
          <span>All intel</span>
        </Link>

        <article className="rex-card p-8">
          <div className="flex items-center gap-2 mb-3 text-[10px] font-mono uppercase tracking-widest">
            <span
              className="px-2 py-0.5 rounded-sm"
              style={{
                background: "rgba(31,168,224,0.10)",
                color: "var(--rex-accent-2)",
                border: "1px solid rgba(31,168,224,0.25)",
              }}
            >
              {chainLabel(entity.chain)}
            </span>
            <span style={{ color: "var(--rex-text-dim)" }}>
              {entity.intel.length}{" "}
              {entity.intel.length === 1 ? "mention" : "mentions"} on file
            </span>
          </div>

          <h1 className="font-display text-2xl md:text-3xl font-semibold tracking-tight text-[var(--rex-text)] mb-3 leading-tight break-all">
            {entity.label ?? truncateAddress(entity.address, 12, 10)}
          </h1>

          <div
            className="font-mono text-xs break-all mb-5"
            style={{ color: "var(--rex-text-muted)" }}
          >
            {explorer ? (
              <a
                href={explorer}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--rex-accent)] hover:underline"
              >
                {entity.address}
              </a>
            ) : (
              entity.address
            )}
          </div>

          {entity.notes && (
            <p
              className="text-sm leading-relaxed"
              style={{ color: "var(--rex-text-muted)" }}
            >
              {entity.notes}
            </p>
          )}

          <div className="mt-6 flex flex-wrap gap-3 text-[10px] font-mono uppercase tracking-widest">
            {entity.category && (
              <span
                className="px-2 py-0.5 rounded-sm"
                style={{
                  background: "rgba(95,185,31,0.10)",
                  color: "var(--rex-accent)",
                  border: "1px solid rgba(95,185,31,0.30)",
                }}
              >
                {CATEGORY_LABEL[entity.category]}
              </span>
            )}
            {entity.ownerName && (
              <span
                className="px-2 py-0.5 rounded-sm"
                style={{
                  background: "rgba(31,168,224,0.10)",
                  color: "var(--rex-accent-2)",
                  border: "1px solid rgba(31,168,224,0.25)",
                }}
              >
                Owner: {entity.ownerName}
              </span>
            )}
            {entity.confidence != null && (
              <span style={{ color: "var(--rex-text-dim)" }}>
                Confidence: {entity.confidence}/100
              </span>
            )}
            {entity.balanceEstimateUsd && (
              <span style={{ color: "var(--rex-text-muted)" }}>
                Balance est.{" "}
                <span className="text-[var(--rex-text)]">
                  {formatUsdShort(Number(entity.balanceEstimateUsd))}
                </span>
              </span>
            )}
            {(["subject", "counterparty", "observed"] as const).map((role) => {
              if (counts[role] === 0) return null;
              const tone = ROLE_TONE[role];
              return (
                <span
                  key={role}
                  className="px-2 py-0.5 rounded-sm"
                  style={{
                    background: tone.bg,
                    color: tone.fg,
                    border: `1px solid ${tone.border}`,
                  }}
                >
                  {counts[role]} × {ROLE_LABEL[role]}
                </span>
              );
            })}
          </div>
        </article>

        {entity.attributions.length > 0 && (
          <section className="mt-8">
            <h2
              className="text-[10px] font-mono uppercase tracking-widest mb-3"
              style={{ color: "var(--rex-text-dim)" }}
            >
              Attribution provenance · {entity.attributions.length} source
              {entity.attributions.length === 1 ? "" : "s"}
            </h2>
            <ul className="space-y-2">
              {entity.attributions.map((a, i) => {
                const tone = SOURCE_TONE[a.source];
                return (
                  <li
                    key={`${a.source}:${a.sourceRef ?? i}`}
                    className="rex-card p-4"
                  >
                    <div className="flex items-center gap-2 mb-2 text-[10px] font-mono uppercase tracking-widest flex-wrap">
                      <span
                        className="px-1.5 py-0.5 rounded-sm"
                        style={{
                          background: tone.bg,
                          color: tone.fg,
                          border: `1px solid ${tone.bg}`,
                        }}
                      >
                        {SOURCE_LABEL[a.source]}
                      </span>
                      {a.category && (
                        <span style={{ color: "var(--rex-text-muted)" }}>
                          → {CATEGORY_LABEL[a.category]}
                        </span>
                      )}
                      {a.confidence != null && (
                        <span style={{ color: "var(--rex-text-dim)" }}>
                          {a.confidence}/100
                        </span>
                      )}
                      <span
                        className="ml-auto"
                        style={{ color: "var(--rex-text-dim)" }}
                      >
                        Harvested{" "}
                        {a.harvestedAt.toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                    {a.ownerName && (
                      <div className="text-sm text-[var(--rex-text)] font-semibold mb-1">
                        {a.ownerName}
                        {a.ownerKind && (
                          <span
                            className="ml-2 text-[10px] font-mono uppercase tracking-widest"
                            style={{ color: "var(--rex-text-dim)" }}
                          >
                            ({a.ownerKind})
                          </span>
                        )}
                      </div>
                    )}
                    {a.label && a.label !== a.ownerName && (
                      <div className="text-sm text-[var(--rex-text-muted)] mb-1">
                        {a.label}
                      </div>
                    )}
                    {a.notes && (
                      <p className="text-xs text-[var(--rex-text-muted)] leading-relaxed">
                        {a.notes}
                      </p>
                    )}
                    {a.sourceUrl && (
                      <a
                        href={a.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block mt-2 text-[10px] font-mono uppercase tracking-widest text-[var(--rex-accent-2)] hover:text-[var(--rex-text)] transition-colors"
                      >
                        Source ▸
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section className="mt-8">
          <h2
            className="text-[10px] font-mono uppercase tracking-widest mb-3"
            style={{ color: "var(--rex-text-dim)" }}
          >
            Intel referencing this address
          </h2>
          {entity.intel.length === 0 ? (
            <div
              className="rex-card-flat p-6 text-sm"
              style={{ color: "var(--rex-text-dim)" }}
            >
              No approved intel mentions this address yet.
            </div>
          ) : (
            <ul className="space-y-2">
              {entity.intel.map((r) => {
                const tone = ROLE_TONE[r.role];
                const dateLabel = r.publishedAt
                  ? new Date(r.publishedAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "";
                const handle = r.payload.anonymous ? null : r.submitterHandle;
                return (
                  <li key={r.publicId}>
                    <Link
                      href={detailHref("/intel", r.publicId, r.payload.headline)}
                      className="rex-card block p-4 hover:bg-[var(--rex-surface-2)] transition-colors group"
                    >
                      <div className="flex items-center gap-2 mb-1.5 text-[10px] font-mono uppercase tracking-widest">
                        <span
                          className="px-1.5 py-0.5 rounded-sm"
                          style={{
                            background: tone.bg,
                            color: tone.fg,
                            border: `1px solid ${tone.border}`,
                          }}
                        >
                          {ROLE_LABEL[r.role]}
                        </span>
                        {r.payload.kind === "incident" && (
                          <span style={{ color: "#f87171" }}>Incident</span>
                        )}
                        {r.payload.kind === "original" && (
                          <span style={{ color: "var(--rex-accent)" }}>
                            Original
                          </span>
                        )}
                        {dateLabel && (
                          <span
                            className="ml-auto"
                            style={{ color: "var(--rex-text-dim)" }}
                          >
                            {dateLabel}
                          </span>
                        )}
                      </div>
                      <div className="font-display text-base text-[var(--rex-text)] group-hover:text-[var(--rex-accent)] transition-colors mb-1">
                        {r.payload.headline}
                      </div>
                      <p className="text-xs text-[var(--rex-text-muted)] line-clamp-2 leading-relaxed">
                        {r.payload.body}
                      </p>
                      <div
                        className="text-[10px] font-mono mt-2"
                        style={{ color: "var(--rex-text-dim)" }}
                      >
                        Source:{" "}
                        <span style={{ color: "var(--rex-text-muted)" }}>
                          {handle ? `@${handle}` : "Anonymous"}
                        </span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </PublicShell>
  );
}
