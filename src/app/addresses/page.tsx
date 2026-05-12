import Link from "next/link";
import type { Metadata } from "next";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, addresses, intelAddresses, submissions } from "@/lib/db";
import { PublicShell } from "@/components/public-shell";
import { CHAIN_SLUG_SET, chainLabel } from "@/lib/chains";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Address Dossiers — Rex Intel Services",
  description:
    "Every crypto address with analyst-reviewed intel attached. Built from every approved submission. Searchable, indexable, growing.",
  openGraph: {
    title: "Address Dossiers — Rex Intel Services",
    description:
      "Every crypto address with analyst-reviewed intel attached. RexIntel's proprietary on-chain graph.",
    type: "website",
  },
};

/**
 * Index of every address that has at least one approved intel item
 * attached. Sorted by recency of the most-recent intel that mentions
 * the address — keeps active investigations at the top while older
 * dossiers stay reachable. Capped at 500 rows on the page; pagination
 * is a future iteration.
 */
export default async function AddressesIndexPage({
  searchParams,
}: {
  searchParams: { chain?: string };
}) {
  const chainFilter =
    searchParams.chain && CHAIN_SLUG_SET.has(searchParams.chain)
      ? searchParams.chain
      : null;

  // Aggregate by address: mention count + most-recent publishedAt across all
  // approved intel items referencing it. Filter out addresses with zero
  // approved mentions — dangling addresses don't deserve a page.
  const rows = await db
    .select({
      chain: addresses.chain,
      address: addresses.address,
      label: addresses.label,
      mentions: sql<number>`count(${intelAddresses.submissionId})::int`,
      latestPublishedAt: sql<Date | null>`max(${submissions.publishedAt})`,
    })
    .from(addresses)
    .innerJoin(intelAddresses, eq(intelAddresses.addressId, addresses.id))
    .innerJoin(submissions, eq(intelAddresses.submissionId, submissions.id))
    .where(
      and(
        eq(submissions.type, "intel"),
        eq(submissions.status, "approved"),
        chainFilter ? eq(addresses.chain, chainFilter) : sql`true`,
      ),
    )
    .groupBy(addresses.id, addresses.chain, addresses.address, addresses.label)
    .orderBy(desc(sql`max(${submissions.publishedAt})`))
    .limit(500);

  // Distinct chains across the whole index (not just the filtered view) for
  // the chip row. Cheap second query — no point paginating chain lookup.
  const chainCounts = await db
    .select({
      chain: addresses.chain,
      cnt: sql<number>`count(distinct ${addresses.id})::int`,
    })
    .from(addresses)
    .innerJoin(intelAddresses, eq(intelAddresses.addressId, addresses.id))
    .innerJoin(submissions, eq(intelAddresses.submissionId, submissions.id))
    .where(
      and(eq(submissions.type, "intel"), eq(submissions.status, "approved")),
    )
    .groupBy(addresses.chain);

  const totalTracked = chainCounts.reduce((s, r) => s + r.cnt, 0);

  return (
    <PublicShell
      classification={[
        { text: "● Open Channel // Address Graph" },
        { text: `${totalTracked} tracked · ${chainCounts.length} chains`, show: "sm" },
      ]}
    >
      <main className="max-w-4xl mx-auto px-6 pt-8 md:pt-14 pb-24">
        <div className="mb-8">
          <p
            className="text-xs uppercase tracking-widest mb-2"
            style={{ color: "var(--rex-text-dim)" }}
          >
            ▸ Address Graph
          </p>
          <h1 className="font-display text-4xl md:text-5xl font-semibold tracking-tight text-white mb-3">
            Every address we&apos;re watching.
          </h1>
          <p className="text-sm md:text-base text-[var(--rex-text-muted)] max-w-xl leading-relaxed">
            Built from every approved intel submission. {totalTracked} addresses
            across {chainCounts.length} chains, sorted by recent activity.{" "}
            <Link
              href="/submit?type=intel"
              className="text-[var(--rex-accent)] hover:text-white transition-colors"
            >
              Drop intel →
            </Link>
          </p>
        </div>

        {chainCounts.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-6 text-xs font-mono">
            <span
              className="uppercase tracking-widest"
              style={{ color: "var(--rex-text-dim)" }}
            >
              CHAIN ▸
            </span>
            <ChainChip href="/addresses" active={!chainFilter}>
              All · {totalTracked}
            </ChainChip>
            {chainCounts
              .sort((a, b) => b.cnt - a.cnt)
              .map((c) => (
                <ChainChip
                  key={c.chain}
                  href={`/addresses?chain=${c.chain}`}
                  active={chainFilter === c.chain}
                >
                  {chainLabel(c.chain)} · {c.cnt}
                </ChainChip>
              ))}
          </div>
        )}

        {rows.length === 0 ? (
          <div
            className="border border-dashed rounded-lg p-12 text-center bg-grid"
            style={{
              borderColor: "var(--rex-border)",
              color: "var(--rex-text-dim)",
            }}
          >
            {chainFilter
              ? `No tracked ${chainLabel(chainFilter)} addresses yet.`
              : "No tracked addresses yet."}
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <AddressRow
                key={`${r.chain}:${r.address}`}
                chain={r.chain}
                address={r.address}
                label={r.label}
                mentions={r.mentions}
                latestPublishedAt={r.latestPublishedAt}
              />
            ))}
          </div>
        )}
      </main>
    </PublicShell>
  );
}

function ChainChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="px-2.5 py-1 rounded-sm uppercase tracking-widest transition-all"
      style={{
        background: active ? "var(--rex-bg)" : "transparent",
        color: active ? "var(--rex-accent)" : "var(--rex-text-dim)",
        border: `1px solid ${active ? "var(--rex-accent)" : "var(--rex-border-subtle)"}`,
      }}
    >
      {children}
    </Link>
  );
}

function AddressRow({
  chain,
  address,
  label,
  mentions,
  latestPublishedAt,
}: {
  chain: string;
  address: string;
  label: string | null;
  mentions: number;
  latestPublishedAt: Date | null;
}) {
  const dateLabel = latestPublishedAt
    ? new Date(latestPublishedAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";
  // Lowercase the path so casing differences canonicalize to one URL.
  // The /address page lookup is case-insensitive anyway.
  return (
    <Link
      href={`/address/${chain}/${address.toLowerCase()}`}
      className="rex-card flex items-center gap-4 p-4 hover:bg-[var(--rex-surface-2)] transition-colors group"
    >
      <div
        className="flex-shrink-0 w-16 text-center"
      >
        <div
          className="text-[10px] font-mono uppercase tracking-widest"
          style={{ color: "var(--rex-text-dim)" }}
        >
          {chainLabel(chain)}
        </div>
        <div
          className="font-display text-xl font-semibold tabular-nums mt-0.5"
          style={{ color: "var(--rex-accent)" }}
        >
          {mentions}
        </div>
      </div>

      <div className="flex-1 min-w-0">
        {label && (
          <div className="text-white text-base font-medium truncate group-hover:text-[var(--rex-accent)] transition-colors">
            {label}
          </div>
        )}
        <div className="font-mono text-xs text-[var(--rex-text-muted)] break-all">
          {address}
        </div>
        {dateLabel && (
          <div
            className="text-[10px] font-mono mt-1"
            style={{ color: "var(--rex-text-dim)" }}
          >
            Last intel: {dateLabel}
          </div>
        )}
      </div>

      <span
        className="text-xs font-mono opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ color: "var(--rex-accent)" }}
      >
        ▸
      </span>
    </Link>
  );
}
