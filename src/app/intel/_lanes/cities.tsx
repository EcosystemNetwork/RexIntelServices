import Link from "next/link";
import { unstable_cache } from "next/cache";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, submissions } from "@/lib/db";
import type { PopupCityPayload } from "@/lib/db/schema";
import { detailHref } from "@/lib/slug";
import { logoUrlFor } from "@/lib/logo";
import { SUBMISSIONS_TAG, LISTING_REVALIDATE_SEC } from "@/lib/cache";
import {
  Chip,
  DeadlineChip,
  EmptyState,
  FilterBar,
  OrgLogo,
  FeaturedTag,
  PasteHint,
  formatRange,
  todayBucket,
  parseSector,
  sectorClause,
  closingSoonClause,
  type Sector,
} from "./_shared";

const SECTOR_LABEL: Record<Sector, string> = {
  web3: "Web3",
  ai: "AI & Robotics",
};

const getCitiesRows = unstable_cache(
  async (
    showPast: boolean,
    sector: Sector | null,
    soon: boolean,
    _bucket: string,
  ) => {
    const now = new Date();
    const pastFloor = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const baseFilter = and(
      eq(submissions.type, "popup_city"),
      eq(submissions.status, "approved"),
    );
    const effectiveEnd = sql`COALESCE(${submissions.eventEndsAt}, ${submissions.eventStartsAt})`;
    // Rolling pop-ups (no dates) belong in Upcoming — they're always
    // accepting / always announced "soon". Treat NULL effectiveEnd as
    // upcoming, never past.
    const upcomingWindow = sql`(${effectiveEnd} IS NULL OR ${effectiveEnd} >= ${now})`;
    const pastWindow = sql`${effectiveEnd} IS NOT NULL AND ${effectiveEnd} < ${now} AND ${effectiveEnd} >= ${pastFloor}`;
    const narrowing = and(
      sectorClause(sector, ["focus", "description", "name", "city", "country"]),
      closingSoonClause(soon, "applicationDeadline"),
    );
    return Promise.all([
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
          and(baseFilter, showPast ? pastWindow : upcomingWindow, narrowing),
        )
        .orderBy(
          ...(showPast
            ? [sql`${effectiveEnd} DESC`]
            : [
                desc(submissions.featured),
                sql`${submissions.eventStartsAt} ASC NULLS LAST`,
              ]),
        )
        .limit(100),
      // Tab counts ignore sector/soon — total upcoming/past stays stable as
      // the user narrows.
      db
        .select({ upcomingCount: sql<number>`count(*)::int` })
        .from(submissions)
        .where(and(baseFilter, upcomingWindow)),
      db
        .select({ pastCount: sql<number>`count(*)::int` })
        .from(submissions)
        .where(and(baseFilter, pastWindow)),
    ]);
  },
  ["intel-lane-cities-v2"],
  { tags: [SUBMISSIONS_TAG], revalidate: LISTING_REVALIDATE_SEC },
);

export async function CitiesLane({
  view,
  sector: sectorParam,
  soon,
}: {
  view?: string;
  sector?: string;
  soon?: string;
}) {
  const showPast = view === "past";
  const sector = parseSector(sectorParam);
  const isSoon = soon === "1";
  // Past is recent-past only — keeps the tab from turning into a graveyard.
  // Bucket on effective end (COALESCE of endsAt + startsAt) so a residency
  // that opened weeks ago but runs through next month is still current.
  const [visibleRows, [{ upcomingCount }], [{ pastCount }]] =
    await getCitiesRows(showPast, sector, isSoon, todayBucket());

  const visible = visibleRows.map((r) => ({
    ...r,
    payload: r.payload as PopupCityPayload,
  }));

  const href = (next: {
    view?: "upcoming" | "past";
    sector?: Sector | null;
    soon?: boolean;
  }) => {
    const params = new URLSearchParams({ lane: "cities" });
    const nv = next.view ?? (showPast ? "past" : "upcoming");
    const nsec = next.sector !== undefined ? next.sector : sector;
    const ns = next.soon !== undefined ? next.soon : isSoon;
    if (nv === "past") params.set("view", "past");
    if (nsec) params.set("sector", nsec);
    if (ns) params.set("soon", "1");
    return `/intel?${params.toString()}`;
  };

  return (
    <>
      <PasteHint>
        Hosting a residency?{" "}
        <Link
          href="/submit?type=popup_city"
          className="text-[var(--rex-accent)] hover:text-white transition-colors underline decoration-dotted underline-offset-2"
        >
          Submit it
        </Link>{" "}
        — events on lu.ma, edgecity.live, zuzalu.city publish instantly.
      </PasteHint>

      <FilterBar
        summary={
          [
            sector ? SECTOR_LABEL[sector] : null,
            showPast ? "Past" : "Upcoming",
            !showPast && isSoon ? "Closing ≤14d" : null,
          ]
            .filter(Boolean)
            .join(" · ")
        }
      >
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          <span
            className="uppercase tracking-widest"
            style={{ color: "var(--rex-text-dim)" }}
          >
            SECTOR ▸
          </span>
          <Chip href={href({ sector: null })} active={!sector}>
            All
          </Chip>
          <Chip href={href({ sector: "web3" })} active={sector === "web3"}>
            Web3
          </Chip>
          <Chip href={href({ sector: "ai" })} active={sector === "ai"}>
            AI & Robotics
          </Chip>
        </div>

        <div className="flex flex-wrap gap-2 text-xs font-mono">
          <Chip href={href({ view: "upcoming" })} active={!showPast}>
            Upcoming · {upcomingCount}
          </Chip>
          <Chip href={href({ view: "past" })} active={showPast}>
            Past · {pastCount}
          </Chip>
          {!showPast && (
            <Chip href={href({ soon: !isSoon })} active={isSoon}>
              Closing ≤14d
            </Chip>
          )}
        </div>
      </FilterBar>

      {visible.length === 0 ? (
        <EmptyState>
          {showPast
            ? "No pop-up cities wrapped in the last 30 days."
            : "No pop-up cities match this filter. Know one we should add?"}
        </EmptyState>
      ) : (
        <div className="space-y-2">
          {visible.map((c) => (
            <PopupCityCard
              key={c.id}
              publicId={c.publicId}
              payload={c.payload}
              featured={c.featured}
            />
          ))}
        </div>
      )}
    </>
  );
}

function PopupCityCard({
  publicId,
  payload,
  featured = false,
}: {
  publicId: string;
  payload: PopupCityPayload;
  featured?: boolean;
}) {
  // Dates optional — when missing, render as Rolling/TBC.
  const hasDates = Boolean(payload.startsAt && payload.endsAt);
  const start = hasDates ? new Date(payload.startsAt as string) : null;
  const end = hasDates ? new Date(payload.endsAt as string) : null;
  const range = start && end ? formatRange(start, end) : "";
  const location = [payload.city, payload.country].filter(Boolean).join(", ");

  return (
    <Link
      href={detailHref("/pop-up-cities", publicId, payload.name)}
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
        className="flex-shrink-0 w-16 h-16 rounded-sm flex flex-col items-center justify-center border text-center px-1"
        style={{ background: "var(--rex-bg)", borderColor: "var(--rex-border)" }}
      >
        {start && end ? (
          <>
            <div
              className="text-[9px] font-mono uppercase tracking-widest"
              style={{ color: "var(--rex-text-dim)" }}
            >
              {start.toLocaleDateString(undefined, { month: "short" })}
            </div>
            <div className="text-xl font-display text-white leading-none">
              {start.getDate()}
            </div>
            <div
              className="text-[9px] font-mono uppercase tracking-widest mt-0.5"
              style={{ color: "var(--rex-text-dim)" }}
            >
              → {end.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </div>
          </>
        ) : (
          <div
            className="text-[10px] font-mono uppercase tracking-widest"
            style={{ color: "var(--rex-accent)" }}
          >
            Rolling
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 text-[10px] font-mono uppercase tracking-widest flex-wrap">
          {featured && <FeaturedTag />}
          {payload.organization && (
            <>
              <OrgLogo
                src={logoUrlFor(payload.organizationUrl, payload.url, payload.applyUrl)}
                org={payload.organization}
                size="sm"
              />
              <span style={{ color: "var(--rex-text-dim)" }}>
                {payload.organization}
              </span>
            </>
          )}
          {payload.focus && (
            <span style={{ color: "var(--rex-text-muted)" }}>· {payload.focus}</span>
          )}
          <DeadlineChip
            deadline={payload.applicationDeadline}
            rolling={payload.rolling}
          />
        </div>
        <div className="text-white text-base font-medium truncate group-hover:text-[var(--rex-accent)] transition-colors">
          {payload.name}
        </div>
        <div
          className="text-xs mt-0.5 font-mono"
          style={{ color: "var(--rex-text-dim)" }}
        >
          {range || (hasDates ? null : "Rolling cohort")}
          {location && `${range || !hasDates ? " · " : ""}${location}`}
        </div>
      </div>
    </Link>
  );
}
