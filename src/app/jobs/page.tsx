import Link from "next/link";
import type { Metadata } from "next";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { db, submissions } from "@/lib/db";
import type { JobPayload } from "@/lib/db/schema";
import { ResourceListShell, EmptyState } from "@/components/resource-shell";
import { resolveLoc } from "@/lib/loc-context";
import { LocationDatalist, LOCATION_DATALIST_ID } from "@/components/location-datalist";
import { LocationPill } from "@/components/location-pill";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Jobs — Rex Intel Services",
  description:
    "Open roles at crypto companies. Submitted by hiring teams and the community.",
  openGraph: {
    title: "Jobs — Rex Intel Services",
    description:
      "Open roles at crypto companies. Submitted by hiring teams and the community.",
    type: "website",
  },
};

export default async function JobsPage({
  searchParams,
}: {
  searchParams: { filter?: string; loc?: string };
}) {
  // Filter out listings with an expiresAt in the past. Listings without an
  // expiresAt fall back to "still open"; if they get stale a moderator can
  // remove them.
  const nowIso = new Date().toISOString();
  const notExpired = or(
    isNull(sql`${submissions.payload}->>'expiresAt'`),
    sql`(${submissions.payload}->>'expiresAt')::timestamptz > ${nowIso}::timestamptz`,
  );

  const filter = searchParams.filter === "remote"
    ? "remote"
    : searchParams.filter === "senior"
      ? "senior"
      : null;

  // Cookie fallback for cross-lane location stickiness.
  const loc = resolveLoc(searchParams.loc);

  const filterClause =
    filter === "remote"
      ? sql`(${submissions.payload}->>'remote')::boolean = true`
      : filter === "senior"
        ? sql`${submissions.payload}->>'seniority' IN ('senior','staff','principal','exec')`
        : sql`true`;

  // Job locations are free-form ("Remote (US)", "NYC + Remote"), so a single
  // ILIKE against payload->>'location' is the right primitive here.
  const locClause = loc
    ? sql`${submissions.payload}->>'location' ILIKE ${`%${loc.replace(/[%_\\]/g, "\\$&")}%`}`
    : sql`true`;

  const rows = await db
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
        eq(submissions.type, "job"),
        eq(submissions.status, "approved"),
        notExpired,
        filterClause,
        locClause,
      ),
    )
    .orderBy(desc(submissions.featured), desc(submissions.publishedAt))
    .limit(200);

  const visible = rows.map((r) => ({ ...r, payload: r.payload as JobPayload }));

  return (
    <ResourceListShell
      classification={[
        { text: "● Open Channel // Hiring Board" },
        { text: "Open Roles / Crypto Teams", show: "sm" },
      ]}
      kicker="▸ Jobs"
      title="Open roles."
      subtitle="Hiring at a crypto team? Submit your roles. Submissions from Greenhouse, Lever, Ashby, and Wellfound publish instantly."
      submitHref="/submit?type=job"
      submitLabel="+ Post a Job ▸"
      filters={
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
            <span
              className="uppercase tracking-widest"
              style={{ color: "var(--rex-text-dim)" }}
            >
              FILTER ▸
            </span>
            <FilterChip href={chipHref(null, loc)} active={!filter}>
              All
            </FilterChip>
            <FilterChip
              href={chipHref("remote", loc)}
              active={filter === "remote"}
            >
              Remote
            </FilterChip>
            <FilterChip
              href={chipHref("senior", loc)}
              active={filter === "senior"}
            >
              Senior+
            </FilterChip>
          </div>
          <form
            method="get"
            action="/jobs"
            className="flex flex-wrap items-center gap-2"
          >
            {filter && <input type="hidden" name="filter" value={filter} />}
            <input
              type="search"
              name="loc"
              defaultValue={loc}
              placeholder="Location — e.g. Remote, NYC, EU…"
              className="rex-input flex-1 min-w-[220px] max-w-md"
              list={LOCATION_DATALIST_ID}
              autoComplete="off"
            />
            <button type="submit" className="rex-btn whitespace-nowrap">
              Apply ▸
            </button>
            {loc && (
              <Link
                href={filter ? `/jobs?filter=${filter}` : "/jobs"}
                className="text-[11px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)] hover:text-[var(--rex-accent)] transition-colors"
              >
                Clear
              </Link>
            )}
          </form>
        </div>
      }
    >
      {visible.length === 0 ? (
        <EmptyState>
          {loc
            ? `No open roles matching “${loc}”.`
            : "No open roles on the board yet."}
        </EmptyState>
      ) : (
        <div className="space-y-2">
          {visible.map((j) => (
            <JobCard
              key={j.id}
              publicId={j.publicId}
              payload={j.payload}
              featured={j.featured}
            />
          ))}
        </div>
      )}
    </ResourceListShell>
  );
}

function chipHref(filter: "remote" | "senior" | null, loc: string) {
  const params = new URLSearchParams();
  if (filter) params.set("filter", filter);
  if (loc) params.set("loc", loc);
  const qs = params.toString();
  return qs ? `/jobs?${qs}` : "/jobs";
}

function FilterChip({
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

function JobCard({
  publicId,
  payload,
  featured = false,
}: {
  publicId: string;
  payload: JobPayload;
  featured?: boolean;
}) {
  return (
    <Link
      href={`/jobs/${publicId}`}
      className="rex-card block p-5 hover:bg-[var(--rex-surface-2)] transition-colors group"
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
      <div className="flex items-center gap-2 mb-2 text-[10px] font-mono uppercase tracking-widest flex-wrap">
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
        <span style={{ color: "var(--rex-text-dim)" }}>{payload.company}</span>
        {payload.location && (
          <span style={{ color: "var(--rex-text-muted)" }}>· {payload.location}</span>
        )}
        {payload.remote && (
          <span style={{ color: "var(--rex-accent-2)" }}>· Remote</span>
        )}
        {payload.employmentType && (
          <span style={{ color: "var(--rex-text-dim)" }}>· {payload.employmentType}</span>
        )}
        {payload.compensation && (
          <span className="ml-auto" style={{ color: "var(--rex-text-muted)" }}>
            {payload.compensation}
          </span>
        )}
      </div>

      <h3 className="font-display text-lg text-white mb-1.5 group-hover:text-[var(--rex-accent)] transition-colors">
        {payload.title}
      </h3>

      <p className="text-sm text-[var(--rex-text-muted)] line-clamp-2 leading-relaxed">
        {payload.description}
      </p>
    </Link>
  );
}
