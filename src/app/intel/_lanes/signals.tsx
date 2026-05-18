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
}: {
  sevFilter?: string;
  catFilter?: string;
}) {
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

  const filterHref = (args: { severity?: string; category?: string }) => {
    const params = new URLSearchParams();
    if (args.severity) params.set("severity", args.severity);
    if (args.category) params.set("category", args.category);
    const qs = params.toString();
    return qs ? `/intel?${qs}` : "/intel";
  };

  return (
    <>
      <FilterBar
        summary={
          [sevFilter ?? null, catFilter ?? null].filter(Boolean).join(" · ") ||
          "All"
        }
      >
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          <span
            className="uppercase tracking-widest"
            style={{ color: "var(--rex-text-dim)" }}
          >
            SEVERITY ▸
          </span>
          <Chip href={filterHref({ category: catFilter })} active={!sevFilter}>
            All
          </Chip>
          {(["low", "medium", "high", "critical"] as const).map((s) => (
            <Chip
              key={s}
              href={filterHref({ severity: s, category: catFilter })}
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
            <Chip href={filterHref({ severity: sevFilter })} active={!catFilter}>
              All
            </Chip>
            {categories.map((c) => (
              <Chip
                key={c}
                href={filterHref({ severity: sevFilter, category: c })}
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
        <div className="space-y-3">
          {visible.map((r) => (
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
          ))}
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
            aspectRatio: "16 / 9",
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
