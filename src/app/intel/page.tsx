import Link from "next/link";
import type { Metadata } from "next";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db, submissions } from "@/lib/db";
import type {
  AcceleratorPayload,
  CapitalPayload,
  GrantPayload,
  IntelPayload,
  PopupCityPayload,
  ResidencyPayload,
} from "@/lib/db/schema";
import { PublicShell } from "@/components/public-shell";

export const dynamic = "force-dynamic";

type Lane =
  | "signals"
  | "accelerators"
  | "grants"
  | "cities"
  | "capital"
  | "residencies";

const LANES: { id: Lane; label: string }[] = [
  { id: "signals", label: "Signals" },
  { id: "accelerators", label: "Accel" },
  { id: "grants", label: "Grants" },
  { id: "capital", label: "Capital" },
  { id: "cities", label: "Cities" },
  { id: "residencies", label: "Residencies" },
];

const LANE_COPY: Record<
  Lane,
  {
    kicker: string;
    title: string;
    subtitle: string;
    classification: { text: string; show?: "sm" }[];
    submitHref?: string;
    submitLabel?: string;
  }
> = {
  signals: {
    kicker: "▸ Intel Wire",
    title: "What the field is reporting.",
    subtitle:
      "Tips, sightings and analyst-flagged signals. Reviewed by RexIntel before publication. Anonymous sources welcome.",
    classification: [
      { text: "● Open Channel // Intel Wire" },
      { text: "Approved Submissions / Live", show: "sm" },
    ],
    submitHref: "/submit",
    submitLabel: "Drop intel ▸",
  },
  accelerators: {
    kicker: "▸ Intel · Accelerators",
    title: "Programs worth applying to.",
    subtitle:
      "Accelerators and incubators currently accepting applications — crypto-native programs and broader founder cohorts. Curated by RexIntel.",
    classification: [
      { text: "● Open Channel // Intel · Acceleration Programs" },
      { text: "Cohort Intake / Founders + Builders", show: "sm" },
    ],
    submitHref: "/submit?type=accelerator",
    submitLabel: "+ Add Program ▸",
  },
  grants: {
    kicker: "▸ Intel · Grants",
    title: "Capital for builders.",
    subtitle:
      "Active grant programs from protocols, foundations, and public-goods initiatives. Curated by RexIntel.",
    classification: [
      { text: "● Open Channel // Intel · Capital Allocation" },
      { text: "Active Grant Programs", show: "sm" },
    ],
    submitHref: "/submit?type=grant",
    submitLabel: "+ Add Grant ▸",
  },
  cities: {
    kicker: "▸ Intel · Pop-Up Cities",
    title: "Show up, build together.",
    subtitle:
      "Multi-week residencies — Zuzalu, Edge City, Crecimiento and the next generation of pop-up gatherings. Application-based intake.",
    classification: [
      { text: "● Open Channel // Intel · Pop-Up Residencies" },
      { text: "Multi-week Gatherings / Apply", show: "sm" },
    ],
    submitHref: "/submit?type=popup_city",
    submitLabel: "+ Add City ▸",
  },
  capital: {
    kicker: "▸ Intel · Capital",
    title: "Funds taking cold pitches.",
    subtitle:
      "Pre-seed and early-stage VC funds with public pitch portals. Rolling intake, equity checks, real first-check leads — not cohort programs. Curated by RexIntel.",
    classification: [
      { text: "● Open Channel // Intel · Capital Allocation" },
      { text: "Open Funds / Cold Pitch Portals", show: "sm" },
    ],
  },
  residencies: {
    kicker: "▸ Intel · Residencies",
    title: "Programs that put builders in a room together.",
    subtitle:
      "Multi-week founder + builder residencies — cohort retreats, themed sprints, application-based intake. Distinct from pop-up cities (festivals) and accelerators (equity checks).",
    classification: [
      { text: "● Open Channel // Intel · Builder Residencies" },
      { text: "Cohort Retreats / Apply", show: "sm" },
    ],
    submitHref: "/submit?type=residency",
    submitLabel: "+ Add Residency ▸",
  },
};

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

function laneFrom(value: string | undefined): Lane {
  if (
    value === "accelerators" ||
    value === "grants" ||
    value === "cities" ||
    value === "capital" ||
    value === "residencies"
  ) {
    return value;
  }
  return "signals";
}

export function generateMetadata({
  searchParams,
}: {
  searchParams: { lane?: string };
}): Metadata {
  const lane = laneFrom(searchParams.lane);
  const copy = LANE_COPY[lane];
  const titles: Record<Lane, string> = {
    signals: "Intel Wire — Rex Intel Services",
    accelerators: "Accelerators — Intel · Rex Intel Services",
    grants: "Grants — Intel · Rex Intel Services",
    cities: "Pop-Up Cities — Intel · Rex Intel Services",
    capital: "Capital — Funds taking pitches · Rex Intel Services",
    residencies: "Residencies — Intel · Rex Intel Services",
  };
  return {
    title: titles[lane],
    description: copy.subtitle,
    openGraph: {
      title: titles[lane],
      description: copy.subtitle,
      type: "website",
    },
  };
}

export default async function IntelHubPage({
  searchParams,
}: {
  searchParams: {
    lane?: string;
    severity?: string;
    category?: string;
    filter?: string;
    view?: string;
  };
}) {
  const lane = laneFrom(searchParams.lane);
  const copy = LANE_COPY[lane];

  return (
    <PublicShell classification={copy.classification}>
      <main className="max-w-4xl mx-auto px-6 pt-8 md:pt-14 pb-24">
        <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <p
              className="text-xs uppercase tracking-widest mb-2"
              style={{ color: "var(--rex-text-dim)" }}
            >
              {copy.kicker}
            </p>
            <h1 className="font-display text-4xl md:text-5xl font-semibold tracking-tight text-white mb-3">
              {copy.title}
            </h1>
            <p className="text-sm md:text-base text-[var(--rex-text-muted)] max-w-xl leading-relaxed">
              {copy.subtitle}
            </p>
            {lane === "signals" && (
              <div className="mt-3">
                <a
                  href="/intel/feed.xml"
                  className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)] hover:text-[var(--rex-accent)] transition-colors"
                >
                  ⌁ RSS
                </a>
              </div>
            )}
          </div>
          {copy.submitHref && (
            <Link href={copy.submitHref} className="rex-btn whitespace-nowrap">
              {copy.submitLabel ?? "+ Submit ▸"}
            </Link>
          )}
        </div>

        <LaneTabs active={lane} />

        {lane === "signals" && (
          <SignalsLane
            sevFilter={searchParams.severity}
            catFilter={searchParams.category}
          />
        )}
        {lane === "accelerators" && (
          <AcceleratorsLane filter={searchParams.filter} />
        )}
        {lane === "grants" && <GrantsLane filter={searchParams.filter} />}
        {lane === "capital" && <CapitalLane filter={searchParams.filter} />}
        {lane === "residencies" && (
          <ResidenciesLane view={searchParams.view} />
        )}
        {lane === "cities" && <CitiesLane view={searchParams.view} />}
      </main>
    </PublicShell>
  );
}

function LaneTabs({ active }: { active: Lane }) {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-6 text-xs font-mono">
      <span
        className="uppercase tracking-widest"
        style={{ color: "var(--rex-text-dim)" }}
      >
        LANE ▸
      </span>
      {LANES.map((l) => {
        const href = l.id === "signals" ? "/intel" : `/intel?lane=${l.id}`;
        return (
          <Chip key={l.id} href={href} active={active === l.id}>
            {l.label}
          </Chip>
        );
      })}
    </div>
  );
}

function Chip({
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

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="border border-dashed rounded-lg p-12 text-center bg-grid"
      style={{
        borderColor: "var(--rex-border)",
        color: "var(--rex-text-dim)",
      }}
    >
      {children}
    </div>
  );
}

// =====================================================================
// Lane: Signals
// =====================================================================

async function SignalsLane({
  sevFilter,
  catFilter,
}: {
  sevFilter?: string;
  catFilter?: string;
}) {
  const rows = await db
    .select({
      id: submissions.id,
      publicId: submissions.publicId,
      payload: submissions.payload,
      submitterHandle: submissions.submitterHandle,
      publishedAt: submissions.publishedAt,
    })
    .from(submissions)
    .where(
      and(eq(submissions.type, "intel"), eq(submissions.status, "approved")),
    )
    .orderBy(desc(submissions.publishedAt))
    .limit(200);

  const all = rows.map((r) => ({ ...r, payload: r.payload as IntelPayload }));

  let visible = all;
  if (sevFilter) visible = visible.filter((r) => r.payload.severity === sevFilter);
  if (catFilter) {
    visible = visible.filter(
      (r) => r.payload.category?.toLowerCase() === catFilter.toLowerCase(),
    );
  }

  const categories = Array.from(
    new Set(
      all
        .map((r) => r.payload.category)
        .filter((c): c is string => !!c)
        .map((c) => c.toLowerCase()),
    ),
  ).sort();

  const filterHref = (args: { severity?: string; category?: string }) => {
    const params = new URLSearchParams();
    if (args.severity) params.set("severity", args.severity);
    if (args.category) params.set("category", args.category);
    const qs = params.toString();
    return qs ? `/intel?${qs}` : "/intel";
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-4 text-xs font-mono">
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
        <div className="flex flex-wrap items-center gap-2 mb-6 text-xs font-mono">
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
}: {
  publicId: string;
  payload: IntelPayload;
  publishedAt: Date | null;
  submitterHandle: string | null;
}) {
  const dateLabel = publishedAt
    ? new Date(publishedAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";
  const tone = payload.severity ? SEVERITY_TONE[payload.severity] : null;

  return (
    <Link
      href={`/intel/${publicId}`}
      className="rex-card block p-5 hover:bg-[var(--rex-surface-2)] transition-colors group"
    >
      <div className="flex items-center gap-2 mb-2 text-[10px] font-mono uppercase tracking-widest">
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
        {payload.body}
      </p>

      <div
        className="mt-3 text-[10px] font-mono"
        style={{ color: "var(--rex-text-dim)" }}
      >
        Source:{" "}
        <span className="text-[var(--rex-text-muted)]">
          {submitterHandle ? `@${submitterHandle}` : "Anonymous"}
        </span>
      </div>
    </Link>
  );
}

// =====================================================================
// Lane: Accelerators
// =====================================================================

async function AcceleratorsLane({ filter }: { filter?: string }) {
  const intake =
    filter === "rolling" ? "rolling" : filter === "scheduled" ? "scheduled" : null;

  const filterClause =
    intake === "rolling"
      ? sql`(${submissions.payload}->>'rolling')::boolean = true`
      : intake === "scheduled"
        ? sql`${submissions.payload}->>'nextDeadline' IS NOT NULL`
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
        eq(submissions.type, "accelerator"),
        eq(submissions.status, "approved"),
        filterClause,
      ),
    )
    .orderBy(desc(submissions.featured), desc(submissions.publishedAt))
    .limit(200);

  const visible = rows.map((r) => ({
    ...r,
    payload: r.payload as AcceleratorPayload,
  }));

  return (
    <>
      <PasteHint>
        Running a program?{" "}
        <Link
          href="/submit?type=accelerator"
          className="text-[var(--rex-accent)] hover:text-white transition-colors underline decoration-dotted underline-offset-2"
        >
          Submit it
        </Link>{" "}
        — programs from a16zcrypto, Alliance, Orange DAO and similar trusted hosts publish instantly.
      </PasteHint>

      <div className="flex flex-wrap items-center gap-2 mb-6 text-xs font-mono">
        <span
          className="uppercase tracking-widest"
          style={{ color: "var(--rex-text-dim)" }}
        >
          INTAKE ▸
        </span>
        <Chip href="/intel?lane=accelerators" active={!intake}>
          All
        </Chip>
        <Chip
          href="/intel?lane=accelerators&filter=rolling"
          active={intake === "rolling"}
        >
          Rolling
        </Chip>
        <Chip
          href="/intel?lane=accelerators&filter=scheduled"
          active={intake === "scheduled"}
        >
          Scheduled cohort
        </Chip>
      </div>

      {visible.length === 0 ? (
        <EmptyState>No accelerator programs on file yet.</EmptyState>
      ) : (
        <div className="space-y-2">
          {visible.map((a) => (
            <AcceleratorCard
              key={a.id}
              publicId={a.publicId}
              payload={a.payload}
              featured={a.featured}
            />
          ))}
        </div>
      )}
    </>
  );
}

function AcceleratorCard({
  publicId,
  payload,
  featured = false,
}: {
  publicId: string;
  payload: AcceleratorPayload;
  featured?: boolean;
}) {
  const deadlineLabel = payload.nextDeadline
    ? new Date(payload.nextDeadline).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : payload.rolling
      ? "Rolling"
      : null;

  return (
    <Link
      href={`/accelerators/${publicId}`}
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
        {featured && <FeaturedTag />}
        <span style={{ color: "var(--rex-text-dim)" }}>{payload.organization}</span>
        {payload.investment && (
          <span style={{ color: "var(--rex-text-muted)" }}>· {payload.investment}</span>
        )}
        {payload.location && (
          <span style={{ color: "var(--rex-text-dim)" }}>· {payload.location}</span>
        )}
        {deadlineLabel && (
          <span className="ml-auto" style={{ color: "var(--rex-text-dim)" }}>
            Next: {deadlineLabel}
          </span>
        )}
      </div>

      <h3 className="font-display text-lg text-white mb-1.5 group-hover:text-[var(--rex-accent)] transition-colors">
        {payload.name}
      </h3>

      <p className="text-sm text-[var(--rex-text-muted)] line-clamp-2 leading-relaxed">
        {payload.description}
      </p>

      {(payload.focus || payload.duration) && (
        <div
          className="mt-3 text-[10px] font-mono"
          style={{ color: "var(--rex-text-dim)" }}
        >
          {payload.focus && (
            <>
              Focus: <span className="text-[var(--rex-text-muted)]">{payload.focus}</span>
            </>
          )}
          {payload.focus && payload.duration && " · "}
          {payload.duration && (
            <>
              Duration: <span className="text-[var(--rex-text-muted)]">{payload.duration}</span>
            </>
          )}
        </div>
      )}
    </Link>
  );
}

// =====================================================================
// Lane: Grants
// =====================================================================

async function GrantsLane({ filter }: { filter?: string }) {
  const intake =
    filter === "rolling" ? "rolling" : filter === "deadline" ? "deadline" : null;

  const filterClause =
    intake === "rolling"
      ? sql`(${submissions.payload}->>'rolling')::boolean = true`
      : intake === "deadline"
        ? sql`${submissions.payload}->>'deadline' IS NOT NULL`
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
        eq(submissions.type, "grant"),
        eq(submissions.status, "approved"),
        filterClause,
      ),
    )
    .orderBy(desc(submissions.featured), desc(submissions.publishedAt))
    .limit(200);

  const visible = rows.map((r) => ({ ...r, payload: r.payload as GrantPayload }));

  return (
    <>
      <PasteHint>
        Running a grant program?{" "}
        <Link
          href="/submit?type=grant"
          className="text-[var(--rex-accent)] hover:text-white transition-colors underline decoration-dotted underline-offset-2"
        >
          Submit it
        </Link>{" "}
        — programs from ethereum.org, optimism.io, gitcoin.co and similar trusted hosts publish instantly.
      </PasteHint>

      <div className="flex flex-wrap items-center gap-2 mb-6 text-xs font-mono">
        <span
          className="uppercase tracking-widest"
          style={{ color: "var(--rex-text-dim)" }}
        >
          INTAKE ▸
        </span>
        <Chip href="/intel?lane=grants" active={!intake}>
          All
        </Chip>
        <Chip
          href="/intel?lane=grants&filter=rolling"
          active={intake === "rolling"}
        >
          Rolling
        </Chip>
        <Chip
          href="/intel?lane=grants&filter=deadline"
          active={intake === "deadline"}
        >
          With deadline
        </Chip>
      </div>

      {visible.length === 0 ? (
        <EmptyState>No grant programs on file yet.</EmptyState>
      ) : (
        <div className="space-y-2">
          {visible.map((g) => (
            <GrantCard
              key={g.id}
              publicId={g.publicId}
              payload={g.payload}
              featured={g.featured}
            />
          ))}
        </div>
      )}
    </>
  );
}

function GrantCard({
  publicId,
  payload,
  featured = false,
}: {
  publicId: string;
  payload: GrantPayload;
  featured?: boolean;
}) {
  const deadlineLabel = payload.deadline
    ? new Date(payload.deadline).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : payload.rolling
      ? "Rolling"
      : null;

  return (
    <Link
      href={`/grants/${publicId}`}
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
      <div className="flex items-center gap-2 mb-2 text-[10px] font-mono uppercase tracking-widest">
        {featured && <FeaturedTag />}
        <span style={{ color: "var(--rex-text-dim)" }}>{payload.organization}</span>
        {payload.amount && (
          <span style={{ color: "var(--rex-text-muted)" }}>· {payload.amount}</span>
        )}
        {deadlineLabel && (
          <span className="ml-auto" style={{ color: "var(--rex-text-dim)" }}>
            Deadline: {deadlineLabel}
          </span>
        )}
      </div>

      <h3 className="font-display text-lg text-white mb-1.5 group-hover:text-[var(--rex-accent)] transition-colors">
        {payload.name}
      </h3>

      <p className="text-sm text-[var(--rex-text-muted)] line-clamp-2 leading-relaxed">
        {payload.description}
      </p>

      {payload.focus && (
        <div
          className="mt-3 text-[10px] font-mono"
          style={{ color: "var(--rex-text-dim)" }}
        >
          Focus: <span className="text-[var(--rex-text-muted)]">{payload.focus}</span>
        </div>
      )}
    </Link>
  );
}

// =====================================================================
// Lane: Cities
// =====================================================================

async function CitiesLane({ view }: { view?: string }) {
  const showPast = view === "past";
  const now = new Date();
  // Past is recent-past only — keeps the tab from turning into a graveyard.
  const pastFloor = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const baseFilter = and(
    eq(submissions.type, "popup_city"),
    eq(submissions.status, "approved"),
  );

  // A residency that opened weeks ago but runs through next month is still
  // current — bucket on the end, not the start.
  const effectiveEnd = sql`COALESCE(${submissions.eventEndsAt}, ${submissions.eventStartsAt})`;
  const pastWindow = sql`${effectiveEnd} < ${now} AND ${effectiveEnd} >= ${pastFloor}`;

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

  const visible = visibleRows.map((r) => ({
    ...r,
    payload: r.payload as PopupCityPayload,
  }));

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

      <div className="flex gap-2 mb-6">
        <Chip href="/intel?lane=cities" active={!showPast}>
          Upcoming · {upcomingCount}
        </Chip>
        <Chip href="/intel?lane=cities&view=past" active={showPast}>
          Past · {pastCount}
        </Chip>
      </div>

      {visible.length === 0 ? (
        <EmptyState>
          {showPast
            ? "No pop-up cities wrapped in the last 30 days."
            : "No upcoming pop-up cities on file. Know one we should add?"}
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
  const start = new Date(payload.startsAt);
  const end = new Date(payload.endsAt);
  const range = formatRange(start, end);
  const location = [payload.city, payload.country].filter(Boolean).join(", ");
  const applyDeadline = payload.applicationDeadline
    ? new Date(payload.applicationDeadline).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <Link
      href={`/pop-up-cities/${publicId}`}
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
          {payload.organization && (
            <span style={{ color: "var(--rex-text-dim)" }}>
              {payload.organization}
            </span>
          )}
          {payload.focus && (
            <span style={{ color: "var(--rex-text-muted)" }}>· {payload.focus}</span>
          )}
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
          {applyDeadline && ` · Apply by ${applyDeadline}`}
        </div>
      </div>
    </Link>
  );
}

// =====================================================================
// Lane: Capital
// =====================================================================

async function CapitalLane({ filter }: { filter?: string }) {
  // Stage filter narrows the list — most readers shopping for first-check
  // capital are at one specific stage at a time, so this is the highest-value
  // pivot. Free-form match against payload.stage so it lines up with what we
  // actually seed.
  const stage =
    filter === "pre-seed"
      ? "pre-seed"
      : filter === "seed"
        ? "seed"
        : null;

  const filterClause =
    stage === "pre-seed"
      ? sql`LOWER(${submissions.payload}->>'stage') LIKE '%pre-seed%'`
      : stage === "seed"
        ? sql`LOWER(${submissions.payload}->>'stage') LIKE '%seed%' AND LOWER(${submissions.payload}->>'stage') NOT LIKE '%pre-seed%'`
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
        eq(submissions.type, "capital"),
        eq(submissions.status, "approved"),
        filterClause,
      ),
    )
    .orderBy(desc(submissions.featured), desc(submissions.publishedAt))
    .limit(200);

  const visible = rows.map((r) => ({ ...r, payload: r.payload as CapitalPayload }));

  return (
    <>
      <PasteHint>
        Run a fund taking cold pitches?{" "}
        <a
          href="mailto:hello@rexintelservices.com"
          className="text-[var(--rex-accent)] hover:text-white transition-colors underline decoration-dotted underline-offset-2"
        >
          Email us
        </a>{" "}
        — we curate this lane manually so the bar stays high. No application form, no fees.
      </PasteHint>

      <div className="flex flex-wrap items-center gap-2 mb-6 text-xs font-mono">
        <span
          className="uppercase tracking-widest"
          style={{ color: "var(--rex-text-dim)" }}
        >
          STAGE ▸
        </span>
        <Chip href="/intel?lane=capital" active={!stage}>
          All
        </Chip>
        <Chip
          href="/intel?lane=capital&filter=pre-seed"
          active={stage === "pre-seed"}
        >
          Pre-seed
        </Chip>
        <Chip href="/intel?lane=capital&filter=seed" active={stage === "seed"}>
          Seed
        </Chip>
      </div>

      {visible.length === 0 ? (
        <EmptyState>No funds on file for this filter yet.</EmptyState>
      ) : (
        <div className="space-y-2">
          {visible.map((c) => (
            <CapitalCard
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

function CapitalCard({
  publicId,
  payload,
  featured = false,
}: {
  publicId: string;
  payload: CapitalPayload;
  featured?: boolean;
}) {
  return (
    <Link
      href={`/capital/${publicId}`}
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
        {featured && <FeaturedTag />}
        <span style={{ color: "var(--rex-text-dim)" }}>{payload.organization}</span>
        {payload.stage && (
          <span style={{ color: "var(--rex-text-muted)" }}>· {payload.stage}</span>
        )}
        {payload.checkSize && (
          <span style={{ color: "var(--rex-text-muted)" }}>· {payload.checkSize}</span>
        )}
        {payload.location && (
          <span style={{ color: "var(--rex-text-dim)" }}>· {payload.location}</span>
        )}
        {payload.decisionWindow && (
          <span className="ml-auto" style={{ color: "var(--rex-accent)" }}>
            {payload.decisionWindow}
          </span>
        )}
      </div>

      <h3 className="font-display text-lg text-white mb-1.5 group-hover:text-[var(--rex-accent)] transition-colors">
        {payload.name}
      </h3>

      <p className="text-sm text-[var(--rex-text-muted)] line-clamp-2 leading-relaxed">
        {payload.description}
      </p>

      {payload.focus && (
        <div
          className="mt-3 text-[10px] font-mono"
          style={{ color: "var(--rex-text-dim)" }}
        >
          Focus: <span className="text-[var(--rex-text-muted)]">{payload.focus}</span>
        </div>
      )}
    </Link>
  );
}

async function ResidenciesLane({ view }: { view?: string }) {
  const showPast = view === "past";
  const now = new Date();
  const pastFloor = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const baseFilter = and(
    eq(submissions.type, "residency"),
    eq(submissions.status, "approved"),
  );

  const effectiveEnd = sql`COALESCE(${submissions.eventEndsAt}, ${submissions.eventStartsAt})`;
  const pastWindow = sql`${effectiveEnd} < ${now} AND ${effectiveEnd} >= ${pastFloor}`;

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
  const applyDeadline = payload.applicationDeadline
    ? new Date(payload.applicationDeadline).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : null;

  // Residency detail page reuses the pop-up-city detail route — they share
  // shape (multi-week dates + apply URL). If the two diverge, fork later.
  return (
    <Link
      href={`/pop-up-cities/${publicId}`}
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
          <span style={{ color: "var(--rex-text-dim)" }}>{payload.organization}</span>
          {payload.cohortSize && (
            <span style={{ color: "var(--rex-text-muted)" }}>· {payload.cohortSize}</span>
          )}
          {payload.cost && (
            <span style={{ color: "var(--rex-text-muted)" }}>· {payload.cost}</span>
          )}
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
          {applyDeadline && ` · Apply by ${applyDeadline}`}
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

function formatRange(start: Date, end: Date): string {
  const sameMonth =
    start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const startLabel = start.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const endLabel = sameMonth
    ? end.toLocaleDateString(undefined, { day: "numeric", year: "numeric" })
    : end.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
  return `${startLabel}–${endLabel}`;
}

function FeaturedTag() {
  return (
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
  );
}

function PasteHint({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mb-6 rounded-sm border border-dashed p-3 text-[11px] font-mono"
      style={{
        borderColor: "rgba(95,185,31,0.35)",
        background: "rgba(95,185,31,0.04)",
        color: "var(--rex-text-muted)",
      }}
    >
      <span className="text-[var(--rex-accent)]">▸</span> {children}
    </div>
  );
}
