import Link from "next/link";
import type { Metadata } from "next";
import { and, desc, eq } from "drizzle-orm";
import { db, submissions } from "@/lib/db";
import type { IntelPayload } from "@/lib/db/schema";
import { PublicShell } from "@/components/public-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Intel Wire — Rex Intel Services",
  description:
    "Field-submitted, analyst-reviewed intelligence on the digital asset markets. Tips, sightings, and signals.",
  openGraph: {
    title: "Intel Wire — Rex Intel Services",
    description:
      "Field-submitted, analyst-reviewed intelligence on the digital asset markets.",
    type: "website",
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

export default async function IntelPage({
  searchParams,
}: {
  searchParams: { severity?: string; category?: string };
}) {
  const sevFilter = searchParams.severity;
  const catFilter = searchParams.category;

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

  const all = rows.map((r) => ({
    ...r,
    payload: r.payload as IntelPayload,
  }));

  let visible = all;
  if (sevFilter) {
    visible = visible.filter((r) => r.payload.severity === sevFilter);
  }
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

  return (
    <PublicShell
      classification={[
        { text: "● Open Channel // Intel Wire" },
        { text: "Approved Submissions / Live", show: "sm" },
      ]}
    >
      <main className="max-w-4xl mx-auto px-6 pt-8 md:pt-14 pb-24">
        <div className="mb-8">
          <p
            className="text-xs uppercase tracking-widest mb-2"
            style={{ color: "var(--rex-text-dim)" }}
          >
            ▸ Intel Wire
          </p>
          <h1 className="font-display text-4xl md:text-5xl font-semibold tracking-tight text-white mb-3">
            What the field is reporting.
          </h1>
          <p className="text-sm md:text-base text-[var(--rex-text-muted)] max-w-xl leading-relaxed">
            Tips, sightings and analyst-flagged signals. Reviewed by RexIntel
            before publication. Anonymous sources welcome.{" "}
            <Link
              href="/submit"
              className="text-[var(--rex-accent)] hover:text-white transition-colors"
            >
              Drop intel →
            </Link>
          </p>
          <div className="mt-3">
            <a
              href="/intel/feed.xml"
              className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)] hover:text-[var(--rex-accent)] transition-colors"
            >
              ⌁ RSS
            </a>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-6 text-xs font-mono">
          <span
            className="uppercase tracking-widest"
            style={{ color: "var(--rex-text-dim)" }}
          >
            SEVERITY ▸
          </span>
          <FilterChip href={filterHref({ category: catFilter })} active={!sevFilter}>
            All
          </FilterChip>
          {(["low", "medium", "high", "critical"] as const).map((s) => (
            <FilterChip
              key={s}
              href={filterHref({ severity: s, category: catFilter })}
              active={sevFilter === s}
            >
              {s}
            </FilterChip>
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
            <FilterChip href={filterHref({ severity: sevFilter })} active={!catFilter}>
              All
            </FilterChip>
            {categories.map((c) => (
              <FilterChip
                key={c}
                href={filterHref({ severity: sevFilter, category: c })}
                active={catFilter?.toLowerCase() === c}
              >
                {c}
              </FilterChip>
            ))}
          </div>
        )}

        {visible.length === 0 ? (
          <div
            className="border border-dashed rounded-lg p-12 text-center bg-grid"
            style={{
              borderColor: "var(--rex-border)",
              color: "var(--rex-text-dim)",
            }}
          >
            No intel matches this filter.
          </div>
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
      </main>
    </PublicShell>
  );
}

function filterHref(args: {
  severity?: string;
  category?: string;
}): string {
  const params = new URLSearchParams();
  if (args.severity) params.set("severity", args.severity);
  if (args.category) params.set("category", args.category);
  const qs = params.toString();
  return qs ? `/intel?${qs}` : "/intel";
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
