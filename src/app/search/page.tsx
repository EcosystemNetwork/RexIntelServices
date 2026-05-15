import Link from "next/link";
import type { Metadata } from "next";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { db, submissions } from "@/lib/db";
import type {
  EventPayload,
  JobPayload,
  HackathonPayload,
  PopupCityPayload,
  GrantPayload,
  AcceleratorPayload,
  CapitalPayload,
} from "@/lib/db/schema";
import { PublicShell } from "@/components/public-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Search — Rex Intel Services",
  description:
    "Search across events, jobs, hackathons, grants, accelerators, capital, and pop-up cities.",
};

type SearchableType =
  | "event"
  | "job"
  | "hackathon"
  | "popup_city"
  | "grant"
  | "accelerator"
  | "capital";

const ALL_TYPES: SearchableType[] = [
  "event",
  "job",
  "hackathon",
  "popup_city",
  "grant",
  "accelerator",
  "capital",
];

const TYPE_LABEL: Record<SearchableType, string> = {
  event: "Events",
  job: "Jobs",
  hackathon: "Hackathons",
  popup_city: "Pop-up Cities",
  grant: "Grants",
  accelerator: "Accelerators",
  capital: "Capital",
};

const TYPE_HREF: Record<SearchableType, (publicId: string) => string> = {
  event: (id) => `/events/${id}`,
  job: (id) => `/jobs/${id}`,
  hackathon: (id) => `/hackathons/${id}`,
  popup_city: (id) => `/pop-up-cities/${id}`,
  grant: (id) => `/grants/${id}`,
  accelerator: (id) => `/accelerators/${id}`,
  capital: (id) => `/capital/${id}`,
};

const TYPE_LANE_HREF: Record<SearchableType, string> = {
  event: "/events",
  job: "/jobs",
  hackathon: "/hackathons",
  popup_city: "/pop-up-cities",
  grant: "/intel?lane=grants",
  accelerator: "/intel?lane=accelerators",
  capital: "/intel?lane=capital",
};

function escapeLike(s: string) {
  return s.replace(/[%_\\]/g, "\\$&");
}

function asType(raw: string | undefined): SearchableType | "all" {
  if (!raw) return "all";
  return (ALL_TYPES as string[]).includes(raw)
    ? (raw as SearchableType)
    : "all";
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: { q?: string; loc?: string; type?: string };
}) {
  const q = (searchParams.q ?? "").trim().slice(0, 80);
  const loc = (searchParams.loc ?? "").trim().slice(0, 80);
  const type = asType(searchParams.type);

  const hasQuery = Boolean(q || loc);

  // Different payload types stash text in different keys. We coalesce the
  // common ones so a single ILIKE matches everywhere — title/name for the
  // headline, company/organization for issuer, plus description.
  const qLike = q ? `%${escapeLike(q)}%` : null;
  const locLike = loc ? `%${escapeLike(loc)}%` : null;

  const filters: SQL[] = [eq(submissions.status, "approved")];

  if (type !== "all") {
    filters.push(eq(submissions.type, type));
  } else {
    // Restrict to publicly-routable types only.
    filters.push(
      sql`${submissions.type} IN ('event','job','hackathon','popup_city','grant','accelerator','capital')`,
    );
  }

  if (qLike) {
    filters.push(
      sql`(
        COALESCE(${submissions.payload}->>'name', ${submissions.payload}->>'title') ILIKE ${qLike}
        OR ${submissions.payload}->>'description' ILIKE ${qLike}
        OR COALESCE(${submissions.payload}->>'organization', ${submissions.payload}->>'company') ILIKE ${qLike}
      )`,
    );
  }

  if (locLike) {
    filters.push(
      sql`(
        ${submissions.payload}->>'city' ILIKE ${locLike}
        OR ${submissions.payload}->>'country' ILIKE ${locLike}
        OR ${submissions.payload}->>'location' ILIKE ${locLike}
      )`,
    );
  }

  const rows = hasQuery
    ? await db
        .select({
          id: submissions.id,
          publicId: submissions.publicId,
          type: submissions.type,
          payload: submissions.payload,
          publishedAt: submissions.publishedAt,
        })
        .from(submissions)
        .where(and(...filters))
        .orderBy(desc(submissions.featured), desc(submissions.publishedAt))
        .limit(120)
    : [];

  const grouped = new Map<SearchableType, typeof rows>();
  for (const r of rows) {
    const t = r.type as SearchableType;
    if (!ALL_TYPES.includes(t)) continue;
    const bucket = grouped.get(t) ?? [];
    bucket.push(r);
    grouped.set(t, bucket);
  }

  const groupOrder: SearchableType[] =
    type !== "all"
      ? [type]
      : ALL_TYPES.filter((t) => grouped.has(t));

  const summary = [
    q && `“${q}”`,
    loc && `in ${loc}`,
    type !== "all" && TYPE_LABEL[type].toLowerCase(),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <PublicShell
      classification={[
        { text: "● Open Channel // Search" },
        { text: "Cross-Lane Lookup", show: "sm" },
      ]}
    >
      <main className="max-w-4xl mx-auto px-6 pt-8 md:pt-14 pb-24">
        <div className="mb-8">
          <p
            className="text-xs uppercase tracking-widest mb-2"
            style={{ color: "var(--rex-text-dim)" }}
          >
            ▸ Search
          </p>
          <h1 className="font-display text-4xl md:text-5xl font-semibold tracking-tight text-white mb-3">
            {hasQuery ? "Results" : "Search across the field."}
          </h1>
          {hasQuery ? (
            <p className="text-sm text-[var(--rex-text-muted)]">
              {rows.length} result{rows.length === 1 ? "" : "s"} {summary && `· ${summary}`}
            </p>
          ) : (
            <p className="text-sm md:text-base text-[var(--rex-text-muted)] max-w-xl leading-relaxed">
              One search box for events, jobs, hackathons, grants, accelerators,
              capital, and pop-up cities. Add a city to scope it geographically.
            </p>
          )}
        </div>

        <form
          method="get"
          action="/search"
          className="mb-6 flex flex-wrap items-center gap-2"
        >
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Name, company, organization, description…"
            className="rex-input flex-1 min-w-[240px]"
            autoFocus={!hasQuery}
          />
          <input
            type="search"
            name="loc"
            defaultValue={loc}
            placeholder="City or country…"
            className="rex-input min-w-[180px] max-w-[240px]"
          />
          <select
            name="type"
            defaultValue={type}
            className="rex-input max-w-[180px]"
            aria-label="Type"
          >
            <option value="all">All types</option>
            {ALL_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
          <button type="submit" className="rex-btn whitespace-nowrap">
            Search ▸
          </button>
          {hasQuery && (
            <Link
              href="/search"
              className="text-[11px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)] hover:text-[var(--rex-accent)] transition-colors"
            >
              Clear
            </Link>
          )}
        </form>

        {!hasQuery ? (
          <div
            className="border border-dashed rounded-lg p-12 text-center bg-grid"
            style={{
              borderColor: "var(--rex-border)",
              color: "var(--rex-text-dim)",
            }}
          >
            Type a name, company, city, or country to begin.
          </div>
        ) : rows.length === 0 ? (
          <div
            className="border border-dashed rounded-lg p-12 text-center bg-grid"
            style={{
              borderColor: "var(--rex-border)",
              color: "var(--rex-text-dim)",
            }}
          >
            <div className="mb-3">No matches for {summary || "that query"}.</div>
            <Link
              href="/submit"
              className="text-[var(--rex-accent)] hover:text-white transition-colors text-sm font-mono uppercase tracking-widest"
            >
              + Submit something ▸
            </Link>
          </div>
        ) : (
          <div className="space-y-8">
            {groupOrder.map((t) => {
              const bucket = grouped.get(t) ?? [];
              if (bucket.length === 0) return null;
              return (
                <section key={t}>
                  <div className="flex items-baseline justify-between mb-3">
                    <h2 className="text-xs font-mono uppercase tracking-widest text-[var(--rex-accent)]">
                      ▸ {TYPE_LABEL[t]} · {bucket.length}
                    </h2>
                    <Link
                      href={TYPE_LANE_HREF[t]}
                      className="text-[11px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)] hover:text-[var(--rex-accent)] transition-colors"
                    >
                      Open lane ▸
                    </Link>
                  </div>
                  <div className="space-y-2">
                    {bucket.map((r) => (
                      <ResultCard
                        key={r.id}
                        href={TYPE_HREF[t](r.publicId)}
                        type={t}
                        payload={r.payload as never}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </main>
    </PublicShell>
  );
}

type AnyPayload =
  | EventPayload
  | JobPayload
  | HackathonPayload
  | PopupCityPayload
  | GrantPayload
  | AcceleratorPayload
  | CapitalPayload;

function ResultCard({
  href,
  type,
  payload,
}: {
  href: string;
  type: SearchableType;
  payload: AnyPayload;
}) {
  // Each payload type names its headline differently; coalesce the two we use
  // (jobs use `title`, everything else uses `name`).
  const title =
    "title" in payload && payload.title
      ? payload.title
      : "name" in payload && payload.name
        ? payload.name
        : "Untitled";
  const issuer =
    "company" in payload && payload.company
      ? payload.company
      : "organization" in payload && payload.organization
        ? payload.organization
        : null;
  const city = "city" in payload ? payload.city : undefined;
  const country = "country" in payload ? payload.country : undefined;
  const flatLoc =
    "location" in payload && typeof payload.location === "string"
      ? payload.location
      : undefined;
  const where = flatLoc ?? [city, country].filter(Boolean).join(", ");

  return (
    <Link
      href={href}
      className="rex-card block p-4 hover:bg-[var(--rex-surface-2)] transition-colors group"
    >
      <div className="flex items-center gap-2 mb-1.5 text-[10px] font-mono uppercase tracking-widest flex-wrap">
        <span
          className="px-1.5 py-0.5 rounded-sm"
          style={{
            background: "rgba(31,168,224,0.1)",
            color: "var(--rex-accent-2)",
            border: "1px solid rgba(31,168,224,0.25)",
          }}
        >
          {TYPE_LABEL[type]}
        </span>
        {issuer && (
          <span style={{ color: "var(--rex-text-dim)" }}>· {issuer}</span>
        )}
        {where && (
          <span style={{ color: "var(--rex-text-muted)" }}>· {where}</span>
        )}
      </div>
      <div className="text-white text-base font-medium group-hover:text-[var(--rex-accent)] transition-colors">
        {title}
      </div>
      {"description" in payload && payload.description && (
        <p className="text-xs text-[var(--rex-text-muted)] mt-1 line-clamp-2 leading-relaxed">
          {payload.description}
        </p>
      )}
    </Link>
  );
}
