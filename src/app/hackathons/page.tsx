import Link from "next/link";
import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db, submissions } from "@/lib/db";
import type { EventPayload } from "@/lib/db/schema";
import { PublicShell } from "@/components/public-shell";
import { ProxiedImage } from "@/components/proxied-image";
import { resolveLoc } from "@/lib/loc-context";
import { LocationDatalist, LOCATION_DATALIST_ID } from "@/components/location-datalist";
import { LocationPill } from "@/components/location-pill";
import { SUBMISSIONS_TAG, LISTING_REVALIDATE_SEC } from "@/lib/cache";
import { detailHref } from "@/lib/slug";

export const dynamic = "force-dynamic";

type HackathonMode = "all" | "online" | "irl";
type HackathonSort = "start" | "ending" | "prize";

const PRIZE_BUCKETS = [
  { value: "0", label: "Any prize pool" },
  { value: "1000", label: "$1K+" },
  { value: "10000", label: "$10K+" },
  { value: "50000", label: "$50K+" },
  { value: "100000", label: "$100K+" },
  { value: "250000", label: "$250K+" },
] as const;

const getHackathonsBoard = unstable_cache(
  async (
    q: string,
    loc: string,
    mode: HackathonMode,
    sort: HackathonSort,
    minPrize: number,
    showPast: boolean,
    nowMs: number,
    pastFloorMs: number,
  ) => {
    const now = new Date(nowMs);
    const pastFloor = new Date(pastFloorMs);

    const cityLower = sql`LOWER(COALESCE(${submissions.payload}->>'city', ''))`;
    const onlineMatch = sql`${cityLower} IN ('online', 'virtual', 'remote', 'global')`;

    const filters = [
      eq(submissions.type, "event"),
      eq(submissions.status, "approved"),
      sql`${submissions.payload}->>'eventType' = 'hackathon'`,
    ];
    if (mode === "online") filters.push(onlineMatch);
    if (mode === "irl") filters.push(sql`NOT (${onlineMatch})`);
    if (q) {
      const like = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
      filters.push(
        sql`(${submissions.payload}->>'name' ILIKE ${like} OR ${submissions.payload}->>'description' ILIKE ${like})`,
      );
    }
    if (loc) {
      const like = `%${loc.replace(/[%_\\]/g, "\\$&")}%`;
      filters.push(
        sql`(${submissions.payload}->>'city' ILIKE ${like} OR ${submissions.payload}->>'country' ILIKE ${like})`,
      );
    }
    if (minPrize > 0) {
      // payload->>'prizeUsd' is text; cast to numeric. Coalesce missing values
      // to 0 so anything without a declared prize drops out of filtered views.
      filters.push(
        sql`COALESCE(NULLIF(${submissions.payload}->>'prizeUsd', ''), '0')::numeric >= ${minPrize}`,
      );
    }
    const hackathonFilter = and(...filters);
    const bucketCountFilter = and(
      eq(submissions.type, "event"),
      eq(submissions.status, "approved"),
      sql`${submissions.payload}->>'eventType' = 'hackathon'`,
    );

    const effectiveEnd = sql`COALESCE(${submissions.eventEndsAt}, ${submissions.eventStartsAt})`;
    const pastWindow = sql`${effectiveEnd} < ${now} AND ${effectiveEnd} >= ${pastFloor}`;
    const prizeExpr = sql`COALESCE(NULLIF(${submissions.payload}->>'prizeUsd', ''), '0')::numeric`;
    const upcomingOrder =
      sort === "ending"
        ? [desc(submissions.featured), sql`${effectiveEnd} ASC`]
        : sort === "prize"
          ? [
              desc(submissions.featured),
              sql`${prizeExpr} DESC`,
              asc(submissions.eventStartsAt),
            ]
          : [desc(submissions.featured), asc(submissions.eventStartsAt)];

    const [visibleRows, [{ upcomingCount }], [{ pastCount }]] = await Promise.all([
      db
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
            hackathonFilter,
            showPast ? pastWindow : sql`${effectiveEnd} >= ${now}`,
          ),
        )
        .orderBy(...(showPast ? [sql`${effectiveEnd} DESC`] : upcomingOrder))
        .limit(100),
      db
        .select({ upcomingCount: sql<number>`count(*)::int` })
        .from(submissions)
        .where(and(bucketCountFilter, sql`${effectiveEnd} >= ${now}`)),
      db
        .select({ pastCount: sql<number>`count(*)::int` })
        .from(submissions)
        .where(and(bucketCountFilter, pastWindow)),
    ]);

    return { visibleRows, upcomingCount, pastCount };
  },
  ["hackathons-board"],
  { tags: [SUBMISSIONS_TAG], revalidate: LISTING_REVALIDATE_SEC },
);

function hourBucket(d: Date): number {
  const ms = d.getTime();
  return ms - (ms % (60 * 60 * 1000));
}

function formatPrizeUsd(amount: number): string {
  if (amount >= 1_000_000) {
    const m = amount / 1_000_000;
    return `$${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  if (amount >= 1_000) {
    const k = amount / 1_000;
    return `$${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}K`;
  }
  return `$${amount}`;
}

export const metadata: Metadata = {
  title: "Hackathons — Rex Intel Services",
  description:
    "Curated list of crypto hackathons worth building at — ETHGlobal, Solana, Chainlink, Encode, and more.",
  alternates: { canonical: "/hackathons" },
  openGraph: {
    title: "Hackathons — Rex Intel Services",
    description:
      "Curated list of crypto hackathons worth building at — ETHGlobal, Solana, Chainlink, Encode, and more.",
    type: "website",
  },
};

export default async function HackathonsPage({
  searchParams,
}: {
  searchParams: {
    view?: string;
    q?: string;
    loc?: string;
    mode?: string;
    sort?: string;
    min?: string;
  };
}) {
  const showPast = searchParams.view === "past";
  const q = (searchParams.q ?? "").trim().slice(0, 80);
  // Cookie fallback for cross-lane location stickiness — read OUTSIDE the
  // cached call (unstable_cache forbids cookie access).
  const loc = resolveLoc(searchParams.loc);
  const mode: HackathonMode =
    searchParams.mode === "online" || searchParams.mode === "irl"
      ? searchParams.mode
      : "all";
  const sort: HackathonSort =
    searchParams.sort === "ending"
      ? "ending"
      : searchParams.sort === "prize"
        ? "prize"
        : "start";
  const minPrize = PRIZE_BUCKETS.some((b) => b.value === searchParams.min)
    ? Number(searchParams.min)
    : 0;

  const nowBucket = hourBucket(new Date());
  const pastFloorBucket = nowBucket - 30 * 24 * 60 * 60 * 1000;

  const { visibleRows, upcomingCount, pastCount } = await getHackathonsBoard(
    q,
    loc,
    mode,
    sort,
    minPrize,
    showPast,
    nowBucket,
    pastFloorBucket,
  );

  const visible = visibleRows.map((r) => ({
    ...r,
    payload: r.payload as EventPayload,
  }));

  const tabHref = (view: "upcoming" | "past") => {
    const params = new URLSearchParams();
    if (view === "past") params.set("view", "past");
    if (q) params.set("q", q);
    if (loc) params.set("loc", loc);
    if (mode !== "all") params.set("mode", mode);
    if (sort !== "start") params.set("sort", sort);
    if (minPrize > 0) params.set("min", String(minPrize));
    const qs = params.toString();
    return qs ? `/hackathons?${qs}` : "/hackathons";
  };
  const filtersActive =
    Boolean(q) ||
    Boolean(loc) ||
    mode !== "all" ||
    sort !== "start" ||
    minPrize > 0;

  return (
    <PublicShell
      classification={[
        { text: "● Open Channel // Builder Lanes" },
        { text: "Hackathons / Crypto Builders", show: "sm" },
      ]}
    >
      <main className="max-w-4xl mx-auto px-6 pt-8 md:pt-14 pb-24">
        <LocationPill />
        <LocationDatalist />
        <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <p
              className="text-xs uppercase tracking-widest mb-2"
              style={{ color: "var(--rex-text-dim)" }}
            >
              ▸ Hackathons
            </p>
            <h1 className="font-display text-4xl md:text-5xl font-semibold tracking-tight text-white mb-3">
              Build weekends that matter.
            </h1>
            <p className="text-sm md:text-base text-[var(--rex-text-muted)] max-w-xl leading-relaxed">
              In-person and online crypto hackathons — ETHGlobal, Solana,
              Chainlink, Encode, and more. Curated by RexIntel.
            </p>
          </div>
          <Link
            href="/submit?type=event&eventType=hackathon"
            className="rex-btn whitespace-nowrap"
          >
            + Add Hackathon ▸
          </Link>
        </div>

        <div
          className="mb-6 rounded-sm border border-dashed p-3 text-[11px] font-mono"
          style={{
            borderColor: "rgba(95,185,31,0.35)",
            background: "rgba(95,185,31,0.04)",
            color: "var(--rex-text-muted)",
          }}
        >
          <span className="text-[var(--rex-accent)]">▸</span> Running a hackathon?{" "}
          <Link
            href="/submit?type=event&eventType=hackathon"
            className="text-[var(--rex-accent)] hover:text-white transition-colors underline decoration-dotted underline-offset-2"
          >
            Submit it
          </Link>{" "}
          — set the event type to <span className="text-[var(--rex-accent)]">Hackathon</span> and it lands here automatically.
        </div>

        <div className="flex gap-2 mb-4">
          <ViewTab href={tabHref("upcoming")} active={!showPast}>
            Upcoming · {upcomingCount}
          </ViewTab>
          <ViewTab href={tabHref("past")} active={showPast}>
            Past · {pastCount}
          </ViewTab>
        </div>

        <form
          method="get"
          action="/hackathons"
          className="mb-6 flex flex-wrap items-center gap-2"
        >
          {showPast && <input type="hidden" name="view" value="past" />}
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search name or description…"
            className="rex-input flex-1 min-w-[220px] max-w-md"
          />
          <input
            type="search"
            name="loc"
            defaultValue={loc}
            placeholder="City or country…"
            className="rex-input min-w-[160px] max-w-[220px]"
            list={LOCATION_DATALIST_ID}
            autoComplete="off"
          />
          <select
            name="mode"
            defaultValue={mode}
            className="rex-input max-w-[160px]"
            aria-label="Mode"
          >
            <option value="all">All modes</option>
            <option value="irl">In-person</option>
            <option value="online">Online</option>
          </select>
          <select
            name="min"
            defaultValue={String(minPrize)}
            className="rex-input max-w-[180px]"
            aria-label="Minimum prize pool"
          >
            {PRIZE_BUCKETS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
          <select
            name="sort"
            defaultValue={sort}
            className="rex-input max-w-[180px]"
            aria-label="Sort"
            disabled={showPast}
          >
            <option value="start">Starting soon</option>
            <option value="ending">Ending soon</option>
            <option value="prize">Biggest prizes</option>
          </select>
          <button type="submit" className="rex-btn whitespace-nowrap">
            Apply ▸
          </button>
          {filtersActive && (
            <Link
              href={showPast ? "/hackathons?view=past" : "/hackathons"}
              className="text-[11px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)] hover:text-[var(--rex-accent)] transition-colors"
            >
              Clear
            </Link>
          )}
        </form>

        {visible.length === 0 ? (
          <div
            className="border border-dashed rounded-lg p-12 text-center bg-grid"
            style={{
              borderColor: "var(--rex-border)",
              color: "var(--rex-text-dim)",
            }}
          >
            {filtersActive
              ? "No hackathons match those filters."
              : showPast
                ? "No hackathons wrapped in the last 30 days."
                : "No upcoming hackathons on file. Check back, or submit one."}
          </div>
        ) : (
          <div className="space-y-2">
            {visible.map((e) => (
              <HackathonCard
                key={e.id}
                publicId={e.publicId}
                payload={e.payload}
                featured={e.featured}
                showEndingSoon={!showPast}
              />
            ))}
          </div>
        )}
      </main>
    </PublicShell>
  );
}

function ViewTab({
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
      className="px-3 py-1.5 rounded-sm text-xs font-mono uppercase tracking-widest transition-all"
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

function HackathonCard({
  publicId,
  payload,
  featured = false,
  showEndingSoon = true,
}: {
  publicId: string;
  payload: EventPayload;
  featured?: boolean;
  showEndingSoon?: boolean;
}) {
  const start = new Date(payload.startsAt);
  const end = payload.endsAt ? new Date(payload.endsAt) : null;
  const dateLabel = start.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const rangeLabel = end
    ? `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })}–${end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
    : dateLabel;
  const monthLabel = start.toLocaleDateString(undefined, { month: "short" });
  const dayLabel = start.getDate();
  const cityLower = (payload.city ?? "").trim().toLowerCase();
  const isOnline = ["online", "virtual", "remote", "global"].includes(cityLower);
  const location = isOnline
    ? "Online"
    : [payload.city, payload.country].filter(Boolean).join(", ");
  const effectiveEnd = end ?? start;
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysToEnd = Math.ceil(
    (effectiveEnd.getTime() - Date.now()) / msPerDay,
  );
  const endsSoon =
    showEndingSoon && daysToEnd >= 0 && daysToEnd <= 14;
  const endsSoonLabel =
    daysToEnd === 0
      ? "Ends today"
      : daysToEnd === 1
        ? "Ends tomorrow"
        : `Ends in ${daysToEnd}d`;

  return (
    <Link
      href={detailHref("/events", publicId, payload.name)}
      className="rex-card flex items-center gap-5 p-4 hover:bg-[var(--rex-surface-2)] transition-colors group"
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
      <div
        className="flex-shrink-0 w-14 h-14 rounded-sm flex flex-col items-center justify-center border"
        style={{
          background: "var(--rex-bg)",
          borderColor: "var(--rex-border)",
        }}
      >
        <div
          className="text-[10px] font-mono uppercase tracking-widest"
          style={{ color: "var(--rex-text-dim)" }}
        >
          {monthLabel}
        </div>
        <div className="text-xl font-display text-white leading-none">
          {dayLabel}
        </div>
      </div>

      {payload.imageUrl && (
        <div
          className="hidden sm:block flex-shrink-0 h-14 w-24 rounded-sm overflow-hidden border"
          style={{
            background: "var(--rex-bg)",
            borderColor: "var(--rex-border)",
          }}
        >
          <ProxiedImage
            src={payload.imageUrl}
            alt=""
            width={192}
            height={112}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          {featured && (
            <span
              className="text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded-sm"
              style={{
                background: "rgba(95,185,31,0.12)",
                color: "var(--rex-accent)",
                border: "1px solid rgba(95,185,31,0.45)",
              }}
            >
              ★ Featured
            </span>
          )}
          <span
            className="text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded-sm"
            style={{
              background: "rgba(31,168,224,0.1)",
              color: "var(--rex-accent-2)",
              border: "1px solid rgba(31,168,224,0.25)",
            }}
          >
            Hackathon
          </span>
          <span
            className="text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded-sm"
            style={{
              background: isOnline
                ? "rgba(31,168,224,0.06)"
                : "rgba(95,185,31,0.06)",
              color: isOnline ? "var(--rex-accent-2)" : "var(--rex-accent)",
              border: `1px solid ${isOnline ? "rgba(31,168,224,0.25)" : "rgba(95,185,31,0.3)"}`,
            }}
          >
            {isOnline ? "Online" : "In-person"}
          </span>
          {endsSoon && (
            <span
              className="text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded-sm"
              style={{
                background: "rgba(255,168,0,0.08)",
                color: "#ffb84d",
                border: "1px solid rgba(255,168,0,0.35)",
              }}
            >
              ⏳ {endsSoonLabel}
            </span>
          )}
          {typeof payload.prizeUsd === "number" && payload.prizeUsd > 0 && (
            <span
              className="text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded-sm"
              style={{
                background: "rgba(95,185,31,0.12)",
                color: "var(--rex-accent)",
                border: "1px solid rgba(95,185,31,0.45)",
              }}
            >
              ⌬ {formatPrizeUsd(payload.prizeUsd)}
            </span>
          )}
          {payload.priceTier && (
            <span
              className="text-[10px] font-mono uppercase tracking-widest"
              style={{ color: "var(--rex-text-dim)" }}
            >
              · {payload.priceTier}
            </span>
          )}
        </div>
        <div className="text-white text-base font-medium truncate group-hover:text-[var(--rex-accent)] transition-colors">
          {payload.name}
        </div>
        <div
          className="text-xs mt-0.5 font-mono"
          style={{ color: "var(--rex-text-dim)" }}
        >
          {rangeLabel}
          {location && ` · ${location}`}
        </div>
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
