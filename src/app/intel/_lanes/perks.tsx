import Link from "next/link";
import { unstable_cache } from "next/cache";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, submissions } from "@/lib/db";
import type { PerksPayload } from "@/lib/db/schema";
import { detailHref } from "@/lib/slug";
import { logoUrlFor } from "@/lib/logo";
import { SUBMISSIONS_TAG, LISTING_REVALIDATE_SEC } from "@/lib/cache";
import {
  Chip,
  ClosedTag,
  DeadlineChip,
  EmptyState,
  OrgLogo,
  FeaturedTag,
  PasteHint,
  isDeadlinePassed,
  closingSoonClause,
} from "./_shared";

type PerksFilter =
  | { kind: "ecosystem"; ecosystem: "solana" | "ethereum" | "any" }
  | { kind: "tier"; tier: "free" }
  | { kind: "none" };

const getPerksRows = unstable_cache(
  async (f: PerksFilter, soon: boolean) => {
    const filterClause =
      f.kind === "ecosystem" && f.ecosystem === "solana"
        ? sql`LOWER(${submissions.payload}->>'ecosystem') LIKE '%solana%'`
        : f.kind === "ecosystem" && f.ecosystem === "ethereum"
          ? sql`LOWER(${submissions.payload}->>'ecosystem') LIKE '%ethereum%' OR LOWER(${submissions.payload}->>'ecosystem') LIKE '%evm%'`
          : f.kind === "ecosystem" && f.ecosystem === "any"
            ? sql`LOWER(${submissions.payload}->>'ecosystem') IN ('any', 'multi-chain', 'all') OR ${submissions.payload}->>'ecosystem' IS NULL`
            : f.kind === "tier" && f.tier === "free"
              ? sql`${submissions.payload}->>'category' LIKE 'Free ·%'`
              : sql`true`;
    return db
      .select({
        id: submissions.id,
        publicId: submissions.publicId,
        payload: submissions.payload,
        publishedAt: submissions.publishedAt,
        featured: submissions.featured,
      })
      .from(submissions)
      .where(
        and(
          eq(submissions.type, "perks"),
          eq(submissions.status, "approved"),
          filterClause,
          closingSoonClause(soon, "deadline"),
        ),
      )
      .orderBy(
        desc(submissions.featured),
        sql`((${submissions.payload}->>'deadline') IS NOT NULL AND (${submissions.payload}->>'deadline')::timestamptz < now()) ASC`,
        desc(submissions.publishedAt),
      )
      .limit(200);
  },
  ["intel-lane-perks-v4"],
  { tags: [SUBMISSIONS_TAG], revalidate: LISTING_REVALIDATE_SEC },
);

export async function PerksLane({
  filter,
  soon,
}: {
  filter?: string;
  soon?: string;
}) {
  // `filter` is the single-slot ecosystem/tier slot (mutually exclusive — most
  // "free stuff" is chain-agnostic). `soon` is an independent flag that ANDs
  // with whichever slot is active.
  const active: PerksFilter =
    filter === "solana" || filter === "ethereum" || filter === "any"
      ? { kind: "ecosystem", ecosystem: filter }
      : filter === "free"
        ? { kind: "tier", tier: "free" }
        : { kind: "none" };
  const isSoon = soon === "1";

  const rows = await getPerksRows(active, isSoon);

  const visible = rows.map((r) => ({ ...r, payload: r.payload as PerksPayload }));

  const href = (
    next:
      | { kind: "ecosystem"; eco: "solana" | "ethereum" | "any" | null }
      | { kind: "tier"; tier: "free" | null }
      | { kind: "soon"; soon: boolean }
      | { kind: "reset" },
  ) => {
    const params = new URLSearchParams({ lane: "perks" });
    let nextFilter: string | null = null;
    if (active.kind === "ecosystem") nextFilter = active.ecosystem;
    else if (active.kind === "tier") nextFilter = active.tier;
    let nextSoon = isSoon;
    if (next.kind === "ecosystem") nextFilter = next.eco;
    if (next.kind === "tier") nextFilter = next.tier;
    if (next.kind === "soon") nextSoon = next.soon;
    if (next.kind === "reset") {
      nextFilter = null;
      nextSoon = false;
    }
    if (nextFilter) params.set("filter", nextFilter);
    if (nextSoon) params.set("soon", "1");
    return `/intel?${params.toString()}`;
  };

  return (
    <>
      <PasteHint>
        Run a credits / perks program?{" "}
        <Link
          href="/submit?type=perks"
          className="text-[var(--rex-accent)] hover:text-white transition-colors underline decoration-dotted underline-offset-2"
        >
          Submit it
        </Link>{" "}
        — programs from alchemy.com, quicknode.com, helius.dev, stripe.com and similar trusted hosts publish instantly.
      </PasteHint>

      <div className="flex flex-wrap items-center gap-2 mb-3 text-xs font-mono">
        <span
          className="uppercase tracking-widest"
          style={{ color: "var(--rex-text-dim)" }}
        >
          ECOSYSTEM ▸
        </span>
        <Chip
          href={href({ kind: "ecosystem", eco: null })}
          active={active.kind !== "ecosystem"}
        >
          All
        </Chip>
        <Chip
          href={href({ kind: "ecosystem", eco: "solana" })}
          active={active.kind === "ecosystem" && active.ecosystem === "solana"}
        >
          Solana
        </Chip>
        <Chip
          href={href({ kind: "ecosystem", eco: "ethereum" })}
          active={
            active.kind === "ecosystem" && active.ecosystem === "ethereum"
          }
        >
          Ethereum / EVM
        </Chip>
        <Chip
          href={href({ kind: "ecosystem", eco: "any" })}
          active={active.kind === "ecosystem" && active.ecosystem === "any"}
        >
          Any / Multi-chain
        </Chip>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-6 text-xs font-mono">
        <span
          className="uppercase tracking-widest"
          style={{ color: "var(--rex-text-dim)" }}
        >
          TIER ▸
        </span>
        <Chip
          href={href({ kind: "tier", tier: "free" })}
          active={active.kind === "tier" && active.tier === "free"}
        >
          Free stuff (no application)
        </Chip>
        <Chip
          href={href({ kind: "soon", soon: !isSoon })}
          active={isSoon}
        >
          Closing ≤14d
        </Chip>
      </div>

      {visible.length === 0 ? (
        <EmptyState>No perks match this filter yet.</EmptyState>
      ) : (
        <div className="space-y-2">
          {visible.map((p) => (
            <PerksCard
              key={p.id}
              publicId={p.publicId}
              payload={p.payload}
              featured={p.featured}
            />
          ))}
        </div>
      )}
    </>
  );
}

function PerksCard({
  publicId,
  payload,
  featured = false,
}: {
  publicId: string;
  payload: PerksPayload;
  featured?: boolean;
}) {
  const expired = isDeadlinePassed(payload.deadline);

  const logo = logoUrlFor(payload.organizationUrl, payload.applyUrl);

  return (
    <Link
      href={detailHref("/perks", publicId, payload.name)}
      className="rex-card flex gap-4 p-5 hover:bg-[var(--rex-surface-2)] transition-colors group"
      style={
        featured
          ? {
              borderColor: "rgba(95,185,31,0.45)",
              background:
                "linear-gradient(135deg, rgba(95,185,31,0.05) 0%, rgba(31,168,224,0.03) 100%)",
            }
          : expired
            ? { opacity: 0.55 }
            : undefined
      }
    >
      <OrgLogo src={logo} org={payload.organization} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2 text-[10px] font-mono uppercase tracking-widest flex-wrap">
          {featured && <FeaturedTag />}
          {expired && <ClosedTag label="Offer ended" />}
          <span style={{ color: "var(--rex-text-dim)" }}>{payload.organization}</span>
          {payload.category && (
            <span style={{ color: "var(--rex-text-muted)" }}>· {payload.category}</span>
          )}
          {payload.ecosystem && (
            <span style={{ color: "var(--rex-text-dim)" }}>· {payload.ecosystem}</span>
          )}
          {!expired && (
            <DeadlineChip
              deadline={payload.deadline}
              rolling={payload.rolling}
            />
          )}
          {payload.value && (
            <span className="ml-auto" style={{ color: "var(--rex-accent)" }}>
              {payload.value}
            </span>
          )}
        </div>

        <h3 className="font-display text-lg text-white mb-1.5 group-hover:text-[var(--rex-accent)] transition-colors">
          {payload.name}
        </h3>

        <p className="text-sm text-[var(--rex-text-muted)] line-clamp-2 leading-relaxed">
          {payload.description}
        </p>

        {payload.eligibility && (
          <div
            className="mt-3 text-[10px] font-mono"
            style={{ color: "var(--rex-text-dim)" }}
          >
            Eligible: <span className="text-[var(--rex-text-muted)]">{payload.eligibility}</span>
          </div>
        )}
      </div>
    </Link>
  );
}
