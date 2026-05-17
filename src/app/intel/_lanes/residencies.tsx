import Link from "next/link";
import { unstable_cache } from "next/cache";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db, submissions } from "@/lib/db";
import type { ResidencyPayload } from "@/lib/db/schema";
import { detailHref } from "@/lib/slug";
import { logoUrlFor } from "@/lib/logo";
import { SUBMISSIONS_TAG, LISTING_REVALIDATE_SEC } from "@/lib/cache";
import {
  Chip,
  DeadlineChip,
  EmptyState,
  OrgLogo,
  FeaturedTag,
  PasteHint,
  formatRange,
  todayBucket,
} from "./_shared";

const getResidenciesRows = unstable_cache(
  async (showPast: boolean, _bucket: string) => {
    const now = new Date();
    const pastFloor = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const baseFilter = and(
      eq(submissions.type, "residency"),
      eq(submissions.status, "approved"),
    );
    const effectiveEnd = sql`COALESCE(${submissions.eventEndsAt}, ${submissions.eventStartsAt})`;
    const pastWindow = sql`${effectiveEnd} < ${now} AND ${effectiveEnd} >= ${pastFloor}`;
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
          and(
            baseFilter,
            showPast ? pastWindow : sql`${effectiveEnd} >= ${now}`,
          ),
        )
        .orderBy(
          ...(showPast
            ? [sql`${effectiveEnd} DESC`]
            : [desc(submissions.featured), asc(submissions.eventStartsAt)]),
        )
        .limit(100),
      db
        .select({ upcomingCount: sql<number>`count(*)::int` })
        .from(submissions)
        .where(and(baseFilter, sql`${effectiveEnd} >= ${now}`)),
      db
        .select({ pastCount: sql<number>`count(*)::int` })
        .from(submissions)
        .where(and(baseFilter, pastWindow)),
    ]);
  },
  ["intel-lane-residencies-v1"],
  { tags: [SUBMISSIONS_TAG], revalidate: LISTING_REVALIDATE_SEC },
);

export async function ResidenciesLane({ view }: { view?: string }) {
  const showPast = view === "past";
  const [visibleRows, [{ upcomingCount }], [{ pastCount }]] =
    await getResidenciesRows(showPast, todayBucket());

  const visible = visibleRows.map((r) => ({
    ...r,
    payload: r.payload as ResidencyPayload,
  }));

  return (
    <>
      <PasteHint>
        Running a builder residency?{" "}
        <Link
          href="/submit?type=residency"
          className="text-[var(--rex-accent)] hover:text-white transition-colors underline decoration-dotted underline-offset-2"
        >
          Submit it
        </Link>{" "}
        — programs from join-thebridge.com, lu.ma residencies, and similar trusted hosts publish instantly.
      </PasteHint>

      <div className="flex gap-2 mb-6">
        <Chip href="/intel?lane=residencies" active={!showPast}>
          Upcoming · {upcomingCount}
        </Chip>
        <Chip href="/intel?lane=residencies&view=past" active={showPast}>
          Past · {pastCount}
        </Chip>
      </div>

      {visible.length === 0 ? (
        <EmptyState>
          {showPast
            ? "No residencies wrapped in the last 30 days."
            : "No upcoming residencies on file. Know one we should add?"}
        </EmptyState>
      ) : (
        <div className="space-y-2">
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
  payload: ResidencyPayload;
  featured?: boolean;
}) {
  const start = new Date(payload.startsAt);
  const end = new Date(payload.endsAt);
  const range = formatRange(start, end);
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
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 text-[10px] font-mono uppercase tracking-widest flex-wrap">
          {featured && <FeaturedTag />}
          <OrgLogo
            src={logoUrlFor(payload.organizationUrl, payload.url, payload.applyUrl)}
            org={payload.organization}
            size="sm"
          />
          <span style={{ color: "var(--rex-text-dim)" }}>{payload.organization}</span>
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
        <div className="text-white text-base font-medium truncate group-hover:text-[var(--rex-accent)] transition-colors">
          {payload.name}
        </div>
        <div
          className="text-xs mt-0.5 font-mono"
          style={{ color: "var(--rex-text-dim)" }}
        >
          {range}
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
