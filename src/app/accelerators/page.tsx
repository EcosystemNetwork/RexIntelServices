import Link from "next/link";
import type { Metadata } from "next";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, submissions } from "@/lib/db";
import type { AcceleratorPayload } from "@/lib/db/schema";
import { ResourceListShell, EmptyState } from "@/components/resource-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Accelerators — Rex Intel Services",
  description:
    "Crypto accelerators and incubator programs accepting applications. Curated by RexIntel.",
  openGraph: {
    title: "Accelerators — Rex Intel Services",
    description:
      "Crypto accelerators and incubator programs accepting applications.",
    type: "website",
  },
};

export default async function AcceleratorsPage({
  searchParams,
}: {
  searchParams: { filter?: string };
}) {
  const filter = searchParams.filter === "rolling"
    ? "rolling"
    : searchParams.filter === "scheduled"
      ? "scheduled"
      : null;

  const filterClause =
    filter === "rolling"
      ? sql`(${submissions.payload}->>'rolling')::boolean = true`
      : filter === "scheduled"
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
    <ResourceListShell
      classification={[
        { text: "● Open Channel // Acceleration Programs" },
        { text: "Cohort Intake / Crypto Builders", show: "sm" },
      ]}
      kicker="▸ Accelerators"
      title="Programs worth applying to."
      subtitle="Crypto accelerators and incubators currently accepting applications. Curated by RexIntel."
      submitHref="/submit?type=accelerator"
      submitLabel="+ Add Program ▸"
      pasteHint={
        <>
          Running a program?{" "}
          <Link
            href="/submit?type=accelerator"
            className="text-[var(--rex-accent)] hover:text-white transition-colors underline decoration-dotted underline-offset-2"
          >
            Submit it
          </Link>{" "}
          — programs from a16zcrypto, Alliance, Orange DAO and similar trusted hosts publish instantly.
        </>
      }
      filters={
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          <span
            className="uppercase tracking-widest"
            style={{ color: "var(--rex-text-dim)" }}
          >
            INTAKE ▸
          </span>
          <FilterChip href="/accelerators" active={!filter}>All</FilterChip>
          <FilterChip
            href="/accelerators?filter=rolling"
            active={filter === "rolling"}
          >
            Rolling
          </FilterChip>
          <FilterChip
            href="/accelerators?filter=scheduled"
            active={filter === "scheduled"}
          >
            Scheduled cohort
          </FilterChip>
        </div>
      }
    >
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
    </ResourceListShell>
  );
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
