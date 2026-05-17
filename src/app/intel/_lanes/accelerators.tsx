import Link from "next/link";
import { unstable_cache } from "next/cache";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, submissions } from "@/lib/db";
import type { AcceleratorPayload } from "@/lib/db/schema";
import { detailHref } from "@/lib/slug";
import { logoUrlFor } from "@/lib/logo";
import { SUBMISSIONS_TAG, LISTING_REVALIDATE_SEC } from "@/lib/cache";
import {
  Chip,
  ClosedTag,
  EmptyState,
  OrgLogo,
  FeaturedTag,
  PasteHint,
  isDeadlinePassed,
} from "./_shared";

const getAcceleratorsRows = unstable_cache(
  async (intake: "rolling" | "scheduled" | null) => {
    const filterClause =
      intake === "rolling"
        ? sql`(${submissions.payload}->>'rolling')::boolean = true`
        : intake === "scheduled"
          ? sql`${submissions.payload}->>'nextDeadline' IS NOT NULL`
          : sql`true`;
    return db
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
      .orderBy(
        desc(submissions.featured),
        sql`((${submissions.payload}->>'nextDeadline') IS NOT NULL AND (${submissions.payload}->>'nextDeadline')::timestamptz < now()) ASC`,
        desc(submissions.publishedAt),
      )
      .limit(200);
  },
  ["intel-lane-accelerators-v2"],
  { tags: [SUBMISSIONS_TAG], revalidate: LISTING_REVALIDATE_SEC },
);

export async function AcceleratorsLane({ filter }: { filter?: string }) {
  const intake =
    filter === "rolling" ? "rolling" : filter === "scheduled" ? "scheduled" : null;

  const rows = await getAcceleratorsRows(intake);

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
  const expired = isDeadlinePassed(payload.nextDeadline);

  const logo = logoUrlFor(payload.organizationUrl, payload.applyUrl);

  return (
    <Link
      href={detailHref("/accelerators", publicId, payload.name)}
      className="rex-card flex gap-4 p-5 hover:bg-[var(--rex-surface-2)] transition-colors group"
      style={
        featured
          ? {
              borderColor: "rgba(95,185,31,0.45)",
              background:
                "linear-gradient(135deg, rgba(95,185,31,0.05) 0%, rgba(31,168,224,0.03) 100%)",
            }
          : expired
            ? { opacity: 0.55 }
            : undefined
      }
    >
      <OrgLogo src={logo} org={payload.organization} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2 text-[10px] font-mono uppercase tracking-widest flex-wrap">
          {featured && <FeaturedTag />}
          {expired && <ClosedTag label="Cohort closed" />}
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
      </div>
    </Link>
  );
}
