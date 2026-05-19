import Link from "next/link";
import { unstable_cache } from "next/cache";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, submissions } from "@/lib/db";
import type { PopupCityPayload, ResidencyPayload } from "@/lib/db/schema";
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

const getResidenciesRows = unstable_cache(
  async (
    showPast: boolean,
    sector: Sector | null,
    soon: boolean,
    _bucket: string,
  ) => {
    const now = new Date();
    const pastFloor = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const baseFilter = and(
      inArray(submissions.type, ["residency", "popup_city"]),
      eq(submissions.status, "approved"),
    );
    const effectiveEnd = sql`COALESCE(${submissions.eventEndsAt}, ${submissions.eventStartsAt})`;
    // Rolling residencies (no dates) belong in Upcoming — they're always
    // accepting. Treat NULL effectiveEnd as upcoming, never past.
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
      // Tab counts: ignore sector/soon narrowing so the upcoming/past totals
      // don't shrink as the user filters. Matches the convention used by the
      // events + hackathons boards.
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
  ["intel-lane-residencies-v3"],
  { tags: [SUBMISSIONS_TAG], revalidate: LISTING_REVALIDATE_SEC },
);

export async function ResidenciesLane({
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
  const [visibleRows, [{ upcomingCount }], [{ pastCount }]] =
    await getResidenciesRows(showPast, sector, isSoon, todayBucket());

  const visible = visibleRows.map((r) => ({
    ...r,
    payload: r.payload as ResidencyPayload & Partial<PopupCityPayload>,
  }));

  const href = (next: {
    view?: "upcoming" | "past";
    sector?: Sector | null;
    soon?: boolean;
  }) => {
    const params = new URLSearchParams({ lane: "residencies" });
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
        Running a residency or hosting a pop-up city?{" "}
        <Link
          href="/submit?type=residency"
          className="text-[var(--rex-accent)] hover:text-[var(--rex-text)] transition-colors underline decoration-dotted underline-offset-2"
        >
          Submit a residency
        </Link>{" "}
        ·{" "}
        <Link
          href="/submit?type=popup_city"
          className="text-[var(--rex-accent)] hover:text-[var(--rex-text)] transition-colors underline decoration-dotted underline-offset-2"
        >
          Submit a pop-up city
        </Link>{" "}
        — programs from join-thebridge.com, lu.ma, edgecity.live, zuzalu.city and similar trusted hosts publish instantly.
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
            ? "No programs wrapped in the last 30 days."
            : "No programs match this filter. Know one we should add?"}
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {visible.map((r) => (
            <ResidencyCard
              key={r.id}
              publicId={r.publicId}
              payload={r.payload}
              featured={r.featured}
            />
          ))}
        </div>
      )}
    </>
  );
}

function ResidencyCard({
  publicId,
  payload,
  featured = false,
}: {
  publicId: string;
  payload: ResidencyPayload & Partial<PopupCityPayload>;
  featured?: boolean;
}) {
  // Dates are optional — rolling programs (AGI House, Founders Inc, AI
  // Safety Camp) have no fixed cohort window. When absent, the date tile
  // renders as ROLLING and the range line is suppressed.
  const hasDates = Boolean(payload.startsAt && payload.endsAt);
  const start = hasDates ? new Date(payload.startsAt as string) : null;
  const end = hasDates ? new Date(payload.endsAt as string) : null;
  const range = start && end ? formatRange(start, end) : "";
  const location = [payload.city, payload.country].filter(Boolean).join(", ");

  // Residency detail page reuses the pop-up-city detail route — they share
  // shape (multi-week dates + apply URL). If the two diverge, fork later.
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
            <div className="text-xl font-display text-[var(--rex-text)] leading-none">
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
              <span style={{ color: "var(--rex-text-dim)" }}>{payload.organization}</span>
            </>
          )}
          {payload.focus && !payload.organization && (
            <span style={{ color: "var(--rex-text-muted)" }}>{payload.focus}</span>
          )}
          {payload.cohortSize && (
            <span style={{ color: "var(--rex-text-muted)" }}>· {payload.cohortSize}</span>
          )}
          {payload.cost && (
            <span style={{ color: "var(--rex-text-muted)" }}>· {payload.cost}</span>
          )}
          <DeadlineChip
            deadline={payload.applicationDeadline}
            rolling={payload.rolling}
          />
        </div>
        <div className="text-[var(--rex-text)] text-base font-medium truncate group-hover:text-[var(--rex-accent)] transition-colors">
          {payload.name}
        </div>
        <div
          className="text-xs mt-0.5 font-mono"
          style={{ color: "var(--rex-text-dim)" }}
        >
          {range || (hasDates ? null : "Rolling intake")}
          {location && `${range || !hasDates ? " · " : ""}${location}`}
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
