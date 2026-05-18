import Link from "next/link";
import { unstable_cache } from "next/cache";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, submissions } from "@/lib/db";
import type { IntelPayload } from "@/lib/db/schema";
import { detailHref } from "@/lib/slug";
import {
  fetchPoolBalance,
  currentYearMonth,
  getMonthlyTopIntel,
  monthBounds,
} from "@/lib/prize-pool";
import { fetchValueStats } from "@/lib/graph-data";
import { SUBMISSIONS_TAG, LISTING_REVALIDATE_SEC } from "@/lib/cache";
import { Chip, EmptyState, FilterBar, SpicyTag } from "./_shared";

const SEVERITY_TONE: Record<
  NonNullable<IntelPayload["severity"]>,
  { bg: string; fg: string; border: string }
> = {
  low: {
    bg: "rgba(136,136,160,0.08)",
    fg: "var(--rex-text-muted)",
    border: "rgba(136,136,160,0.25)",
  },
  medium: {
    bg: "rgba(96,165,250,0.10)",
    fg: "var(--rex-info)",
    border: "rgba(96,165,250,0.30)",
  },
  high: {
    bg: "rgba(251,191,36,0.10)",
    fg: "var(--rex-warning)",
    border: "rgba(251,191,36,0.30)",
  },
  critical: {
    bg: "rgba(248,113,113,0.10)",
    fg: "var(--rex-danger)",
    border: "rgba(248,113,113,0.30)",
  },
};

const getSignalsRows = unstable_cache(
  async (sevFilter: string | null, catFilter: string | null) => {
    const filters = [
      eq(submissions.type, "intel"),
      eq(submissions.status, "approved"),
    ];
    if (sevFilter) {
      filters.push(sql`${submissions.payload}->>'severity' = ${sevFilter}`);
    }
    if (catFilter) {
      filters.push(
        sql`LOWER(${submissions.payload}->>'category') = ${catFilter.toLowerCase()}`,
      );
    }
    const [visibleRows, categoryRows] = await Promise.all([
      db
        .select({
          id: submissions.id,
          publicId: submissions.publicId,
          payload: submissions.payload,
          submitterHandle: submissions.submitterHandle,
          publishedAt: submissions.publishedAt,
          featured: submissions.featured,
          voteCount: sql<number>`(
            SELECT count(*)::int FROM intel_votes
            WHERE intel_votes.submission_id = ${submissions.id}
          )`,
        })
        .from(submissions)
        .where(and(...filters))
        .orderBy(desc(submissions.featured), desc(submissions.publishedAt))
        .limit(200),
      db.execute<{ category: string }>(sql`
        SELECT DISTINCT LOWER(${submissions.payload}->>'category') AS category
        FROM ${submissions}
        WHERE ${submissions.type} = 'intel'
          AND ${submissions.status} = 'approved'
          AND ${submissions.payload}->>'category' IS NOT NULL
      `),
    ]);
    return {
      visibleRows,
      categories: (categoryRows.rows as { category: string }[])
        .map((r) => r.category)
        .filter((c): c is string => !!c)
        .sort(),
    };
  },
  ["intel-lane-signals-v1"],
  { tags: [SUBMISSIONS_TAG], revalidate: LISTING_REVALIDATE_SEC },
);

// Cached aggregator for the intel-wire "hacked crypto" headline counter.
// `fetchValueStats` runs a full scan over `addresses` — fine on /graph where
// the user opted into a data-heavy view, but /intel is the highest-traffic
// public route, so we wrap it in unstable_cache with a TTL backstop. No tag
// invalidation: the address table is fed by background harvesters (OFAC/
// L2Beat/curated seeds) that don't sit in the submission write path, and the
// counter is approximate-by-nature — 5-minute staleness on a $X billion
// figure is well within the precision the headline implies.
const getHackedCryptoStats = unstable_cache(
  async () => {
    const stats = await fetchValueStats({ includeUserReported: false });
    const hack = stats.byCategory.filter(
      (b) => b.category === "hack-source" || b.category === "hack-destination",
    );
    return {
      totalUsd: hack.reduce((a, b) => a + b.totalUsd, 0),
      walletCount: hack.reduce((a, b) => a + b.walletCount, 0),
    };
  },
  ["intel-hacked-crypto-counter-v1"],
  { revalidate: LISTING_REVALIDATE_SEC },
);

export async function HackedCryptoCounter() {
  const { totalUsd, walletCount } = await getHackedCryptoStats();
  if (totalUsd <= 0 || walletCount === 0) return null;

  return (
    <Link
      href="/graph?view=incidents&category=hack-source"
      className="rex-card-flat block px-5 py-4 mb-5 hover:bg-[var(--rex-surface-2)] transition-colors border-[var(--rex-danger)]/30"
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div>
          <div
            className="text-[10px] font-mono uppercase tracking-widest"
            style={{ color: "var(--rex-danger)" }}
          >
            ▸ Hacked crypto tracked
          </div>
          <div className="font-display text-2xl sm:text-3xl text-white tabular-nums">
            {formatUsdShort(totalUsd)}{" "}
            <span
              className="text-xs font-mono"
              style={{ color: "var(--rex-text-dim)" }}
            >
              across {walletCount} address{walletCount === 1 ? "" : "es"}
            </span>
          </div>
        </div>
        <div className="flex-1 min-w-0 text-xs text-[var(--rex-text-muted)]">
          Sum of last-snapshot USD at addresses tagged hack-source or
          hack-destination — the on-chain footprint of stolen funds RexIntel is
          watching.
        </div>
        <div
          className="text-[11px] font-mono uppercase tracking-widest"
          style={{ color: "var(--rex-danger)" }}
        >
          Open graph ▸
        </div>
      </div>
    </Link>
  );
}

function formatUsdShort(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export async function PrizePoolBanner() {
  const ym = currentYearMonth();
  const { start } = monthBounds(ym);
  const [pool, leader] = await Promise.all([
    fetchPoolBalance(),
    getMonthlyTopIntel({ yearMonth: ym, limit: 1 }),
  ]);

  const monthLabel = new Date(start).toLocaleDateString("en-US", {
    month: "long",
    timeZone: "UTC",
  });
  const poolN = Number(pool.amount);
  const poolStr = Number.isFinite(poolN)
    ? poolN.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : pool.amount;
  const leaderRow = leader[0];
  const leaderHead = leaderRow
    ? (leaderRow.payload as IntelPayload).headline
    : null;

  return (
    <Link
      href="/intel/leaderboard"
      className="rex-card-flat block px-5 py-4 mb-5 hover:bg-[var(--rex-surface-2)] transition-colors"
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div>
          <div
            className="text-[10px] font-mono uppercase tracking-widest"
            style={{ color: "var(--rex-accent)" }}
          >
            ▸ {monthLabel} prize pool
          </div>
          <div className="font-display text-xl text-white tabular-nums">
            {poolStr}{" "}
            <span
              className="text-xs font-mono"
              style={{ color: "var(--rex-text-dim)" }}
            >
              {pool.asset}
            </span>
          </div>
        </div>
        {leaderRow && leaderHead && (
          <div className="flex-1 min-w-0">
            <div
              className="text-[10px] font-mono uppercase tracking-widest"
              style={{ color: "var(--rex-text-dim)" }}
            >
              Leading · {leaderRow.voteCount}{" "}
              {leaderRow.voteCount === 1 ? "vote" : "votes"}
            </div>
            <div className="text-sm text-white truncate">{leaderHead}</div>
          </div>
        )}
        <div
          className="text-[11px] font-mono uppercase tracking-widest"
          style={{ color: "var(--rex-accent)" }}
        >
          Leaderboard ▸
        </div>
      </div>
    </Link>
  );
}

export async function SignalsLane({
  sevFilter,
  catFilter,
  view,
}: {
  sevFilter?: string;
  catFilter?: string;
  view?: string;
}) {
  // View mode controls how the intel cards are laid out below. `grid`
  // (default) is the responsive multi-column layout for higher-density
  // scanning; `list` is the vertical stack of full-width cards.
  const viewMode: "list" | "grid" = view === "list" ? "list" : "grid";
  // Push severity/category filters into SQL so we don't fetch 200 rows just
  // to discard most of them in JS. Indexes added in migration 0015 make these
  // exact-match filters cheap. Results are cached + tag-invalidated, so the
  // chip list and visible rows refresh together when any write happens.
  const { visibleRows, categories } = await getSignalsRows(
    sevFilter ?? null,
    catFilter ?? null,
  );

  const visible = visibleRows.map((r) => ({
    ...r,
    payload: r.payload as IntelPayload,
  }));

  const filterHref = (args: {
    severity?: string;
    category?: string;
    view?: string;
  }) => {
    const params = new URLSearchParams();
    if (args.severity) params.set("severity", args.severity);
    if (args.category) params.set("category", args.category);
    if (args.view && args.view !== "list") params.set("view", args.view);
    const qs = params.toString();
    return qs ? `/intel?${qs}` : "/intel";
  };

  return (
    <>
      <FilterBar
        summary={
          [
            sevFilter ?? null,
            catFilter ?? null,
            viewMode === "grid" ? "grid" : null,
          ]
            .filter(Boolean)
            .join(" · ") || "All"
        }
      >
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          <span
            className="uppercase tracking-widest"
            style={{ color: "var(--rex-text-dim)" }}
          >
            VIEW ▸
          </span>
          <Chip
            href={filterHref({
              severity: sevFilter,
              category: catFilter,
              view: "list",
            })}
            active={viewMode === "list"}
          >
            list
          </Chip>
          <Chip
            href={filterHref({
              severity: sevFilter,
              category: catFilter,
              view: "grid",
            })}
            active={viewMode === "grid"}
          >
            grid
          </Chip>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          <span
            className="uppercase tracking-widest"
            style={{ color: "var(--rex-text-dim)" }}
          >
            SEVERITY ▸
          </span>
          <Chip href={filterHref({ category: catFilter, view: viewMode })} active={!sevFilter}>
            All
          </Chip>
          {(["low", "medium", "high", "critical"] as const).map((s) => (
            <Chip
              key={s}
              href={filterHref({ severity: s, category: catFilter, view: viewMode })}
              active={sevFilter === s}
            >
              {s}
            </Chip>
          ))}
        </div>

        {categories.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
            <span
              className="uppercase tracking-widest"
              style={{ color: "var(--rex-text-dim)" }}
            >
              CATEGORY ▸
            </span>
            <Chip href={filterHref({ severity: sevFilter, view: viewMode })} active={!catFilter}>
              All
            </Chip>
            {categories.map((c) => (
              <Chip
                key={c}
                href={filterHref({ severity: sevFilter, category: c, view: viewMode })}
                active={catFilter?.toLowerCase() === c}
              >
                {c}
              </Chip>
            ))}
          </div>
        )}
      </FilterBar>

      {visible.length === 0 ? (
        <EmptyState>No intel matches this filter.</EmptyState>
      ) : (
        <div
          className={
            viewMode === "grid"
              ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3"
              : "space-y-1.5"
          }
        >
          {visible.map((r) =>
            viewMode === "list" ? (
              <IntelRow
                key={r.id}
                publicId={r.publicId}
                payload={r.payload}
                publishedAt={r.publishedAt}
                submitterHandle={
                  r.payload.anonymous ? null : r.submitterHandle
                }
                voteCount={r.voteCount ?? 0}
                featured={r.featured}
              />
            ) : (
              <IntelCard
                key={r.id}
                publicId={r.publicId}
                payload={r.payload}
                publishedAt={r.publishedAt}
                submitterHandle={
                  r.payload.anonymous ? null : r.submitterHandle
                }
                voteCount={r.voteCount ?? 0}
                featured={r.featured}
              />
            ),
          )}
        </div>
      )}
    </>
  );
}

function IntelCard({
  publicId,
  payload,
  publishedAt,
  submitterHandle,
  voteCount,
  featured = false,
}: {
  publicId: string;
  payload: IntelPayload;
  publishedAt: Date | null;
  submitterHandle: string | null;
  voteCount: number;
  featured?: boolean;
}) {
  const dateLabel = publishedAt
    ? new Date(publishedAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";
  const tone = payload.severity ? SEVERITY_TONE[payload.severity] : null;
  const hasHero = !!payload.heroImageUrl;

  return (
    <Link
      href={detailHref("/intel", publicId, payload.headline)}
      className="rex-card block hover:bg-[var(--rex-surface-2)] transition-colors group overflow-hidden"
      style={
        featured
          ? {
              borderColor: "rgba(95,185,31,0.45)",
              background:
                "linear-gradient(135deg, rgba(95,185,31,0.05) 0%, rgba(31,168,224,0.03) 100%)",
            }
          : undefined
      }
    >
      {hasHero && (
        <div
          className="relative overflow-hidden"
          style={{
            aspectRatio: "2.4 / 1",
            maxHeight: "140px",
            background: "var(--rex-surface-2)",
            borderBottom: "1px solid var(--rex-border-subtle)",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={payload.heroImageUrl!}
            alt={payload.heroAlt ?? payload.headline}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
          />
        </div>
      )}
      <div className="p-5">
      <div className="flex items-center gap-2 mb-2 text-[10px] font-mono uppercase tracking-widest">
        {featured && (
          <span
            className="px-1.5 py-0.5 rounded-sm"
            style={{
              background: "rgba(95,185,31,0.12)",
              color: "var(--rex-accent)",
              border: "1px solid rgba(95,185,31,0.45)",
            }}
          >
            ★ Featured
          </span>
        )}
        {payload.spicy && <SpicyTag />}
        {payload.kind === "original" && (
          <span
            className="px-1.5 py-0.5 rounded-sm"
            style={{
              background: "rgba(95,185,31,0.10)",
              color: "var(--rex-accent)",
              border: "1px solid rgba(95,185,31,0.35)",
            }}
          >
            Original
          </span>
        )}
        {payload.kind === "incident" && (
          <span
            className="px-1.5 py-0.5 rounded-sm"
            style={{
              background: "rgba(248,113,113,0.10)",
              color: "#f87171",
              border: "1px solid rgba(248,113,113,0.35)",
            }}
          >
            Incident
          </span>
        )}
        {payload.severity && tone && (
          <span
            className="px-1.5 py-0.5 rounded-sm"
            style={{
              background: tone.bg,
              color: tone.fg,
              border: `1px solid ${tone.border}`,
            }}
          >
            {payload.severity}
          </span>
        )}
        {payload.sourceGrade === "primary" && (
          <span
            className="px-1.5 py-0.5 rounded-sm"
            style={{
              background: "rgba(95,185,31,0.10)",
              color: "var(--rex-accent)",
              border: "1px solid rgba(95,185,31,0.35)",
            }}
            title="First-hand evidence"
          >
            Primary
          </span>
        )}
        {payload.sourceGrade === "secondary" && (
          <span
            className="px-1.5 py-0.5 rounded-sm"
            style={{
              background: "rgba(96,165,250,0.10)",
              color: "var(--rex-info)",
              border: "1px solid rgba(96,165,250,0.30)",
            }}
            title="Reputable reporting that cites primary sources"
          >
            Secondary
          </span>
        )}
        {payload.category && (
          <span style={{ color: "var(--rex-text-dim)" }}>
            · {payload.category}
          </span>
        )}
        {dateLabel && (
          <span style={{ color: "var(--rex-text-dim)" }} className="ml-auto">
            {dateLabel}
          </span>
        )}
      </div>

      <h3 className="font-display text-lg text-white mb-1.5 group-hover:text-[var(--rex-accent)] transition-colors">
        {payload.headline}
      </h3>

      <p className="text-sm text-[var(--rex-text-muted)] line-clamp-2 leading-relaxed">
        {payload.dek ?? payload.body}
      </p>

      <div
        className="mt-3 flex items-center justify-between text-[10px] font-mono"
        style={{ color: "var(--rex-text-dim)" }}
      >
        <span>
          Source:{" "}
          <span className="text-[var(--rex-text-muted)]">
            {submitterHandle ? `@${submitterHandle}` : "Anonymous"}
          </span>
        </span>
        <span
          className="inline-flex items-center gap-1 uppercase tracking-widest"
          style={{
            color:
              voteCount > 0
                ? "var(--rex-accent)"
                : "var(--rex-text-dim)",
          }}
        >
          ▲ {voteCount.toLocaleString()} {voteCount === 1 ? "vote" : "votes"}
        </span>
      </div>
      </div>
    </Link>
  );
}

function IntelRow({
  publicId,
  payload,
  publishedAt,
  submitterHandle,
  voteCount,
  featured = false,
}: {
  publicId: string;
  payload: IntelPayload;
  publishedAt: Date | null;
  submitterHandle: string | null;
  voteCount: number;
  featured?: boolean;
}) {
  const dateLabel = publishedAt
    ? new Date(publishedAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : "";
  const tone = payload.severity ? SEVERITY_TONE[payload.severity] : null;
  const dek = payload.dek ?? payload.body;

  return (
    <Link
      href={detailHref("/intel", publicId, payload.headline)}
      className="rex-card-flat block px-4 py-2.5 hover:bg-[var(--rex-surface-2)] transition-colors group"
      style={
        featured
          ? {
              borderColor: "rgba(95,185,31,0.45)",
              background:
                "linear-gradient(135deg, rgba(95,185,31,0.04) 0%, rgba(31,168,224,0.02) 100%)",
            }
          : undefined
      }
    >
      <div className="flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 text-[10px] font-mono uppercase tracking-widest">
            {featured && (
              <span style={{ color: "var(--rex-accent)" }}>★ Featured</span>
            )}
            {payload.spicy && <SpicyTag />}
            {payload.kind === "original" && (
              <span style={{ color: "var(--rex-accent)" }}>Original</span>
            )}
            {payload.kind === "incident" && (
              <span style={{ color: "#f87171" }}>Incident</span>
            )}
            {payload.severity && tone && (
              <span style={{ color: tone.fg }}>{payload.severity}</span>
            )}
            {payload.category && (
              <span style={{ color: "var(--rex-text-dim)" }}>
                · {payload.category}
              </span>
            )}
            <span
              style={{ color: "var(--rex-text-dim)" }}
              className="ml-auto sm:hidden"
            >
              {dateLabel}
            </span>
          </div>
          <h3 className="font-display text-sm text-white truncate group-hover:text-[var(--rex-accent)] transition-colors">
            {payload.headline}
          </h3>
          {dek && (
            <p className="text-xs text-[var(--rex-text-muted)] truncate mt-0.5">
              {dek}
            </p>
          )}
        </div>
        <div
          className="hidden sm:flex flex-none flex-col items-end text-[10px] font-mono whitespace-nowrap gap-0.5"
          style={{ color: "var(--rex-text-dim)" }}
        >
          {dateLabel && <span>{dateLabel}</span>}
          <span
            className="uppercase tracking-widest"
            style={{
              color:
                voteCount > 0 ? "var(--rex-accent)" : "var(--rex-text-dim)",
            }}
          >
            ▲ {voteCount.toLocaleString()}
          </span>
          <span className="truncate max-w-[100px]">
            {submitterHandle ? `@${submitterHandle}` : "anon"}
          </span>
        </div>
      </div>
    </Link>
  );
}
