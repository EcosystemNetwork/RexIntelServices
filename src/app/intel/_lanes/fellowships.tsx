import Link from "next/link";
import { unstable_cache } from "next/cache";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, submissions } from "@/lib/db";
import type { FellowshipPayload } from "@/lib/db/schema";
import { detailHref } from "@/lib/slug";
import { logoUrlFor } from "@/lib/logo";
import { SUBMISSIONS_TAG, LISTING_REVALIDATE_SEC } from "@/lib/cache";
import {
  Chip,
  ClosedTag,
  DeadlineChip,
  EmptyState,
  OrgLogo,
  FeaturedTag,
  PasteHint,
  isDeadlinePassed,
} from "./_shared";

const getFellowshipsRows = unstable_cache(
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
          eq(submissions.type, "fellowship"),
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
  ["intel-lane-fellowships-v1"],
  { tags: [SUBMISSIONS_TAG], revalidate: LISTING_REVALIDATE_SEC },
);

export async function FellowshipsLane({ filter }: { filter?: string }) {
  const intake =
    filter === "rolling" ? "rolling" : filter === "scheduled" ? "scheduled" : null;

  const rows = await getFellowshipsRows(intake);

  const visible = rows.map((r) => ({
    ...r,
    payload: r.payload as FellowshipPayload,
  }));

  return (
    <>
      <PasteHint>
        Running a fellowship?{" "}
        <Link
          href="/submit?type=fellowship"
          className="text-[var(--rex-accent)] hover:text-white transition-colors underline decoration-dotted underline-offset-2"
        >
          Submit it
        </Link>{" "}
        — programs from Thiel, Schmidt Sciences, Ethereum Foundation and similar trusted hosts publish instantly.
      </PasteHint>

      <div className="flex flex-wrap items-center gap-2 mb-6 text-xs font-mono">
        <span
          className="uppercase tracking-widest"
          style={{ color: "var(--rex-text-dim)" }}
        >
          INTAKE ▸
        </span>
        <Chip href="/intel?lane=fellowships" active={!intake}>
          All
        </Chip>
        <Chip
          href="/intel?lane=fellowships&filter=rolling"
          active={intake === "rolling"}
        >
          Rolling
        </Chip>
        <Chip
          href="/intel?lane=fellowships&filter=scheduled"
          active={intake === "scheduled"}
        >
          Scheduled cohort
        </Chip>
      </div>

      {visible.length === 0 ? (
        <EmptyState>No fellowship programs on file yet.</EmptyState>
      ) : (
        <div className="space-y-2">
          {visible.map((f) => (
            <FellowshipCard
              key={f.id}
              publicId={f.publicId}
              payload={f.payload}
              featured={f.featured}
            />
          ))}
        </div>
      )}
    </>
  );
}

function FellowshipCard({
  publicId,
  payload,
  featured = false,
}: {
  publicId: string;
  payload: FellowshipPayload;
  featured?: boolean;
}) {
  const expired = isDeadlinePassed(payload.nextDeadline);
  const longDeadline =
    payload.nextDeadline && !expired
      ? new Date(payload.nextDeadline).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : null;

  const logo = logoUrlFor(payload.organizationUrl, payload.applyUrl);

  return (
    <Link
      href={detailHref("/fellowships", publicId, payload.name)}
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
          {payload.stipend && (
            <span style={{ color: "var(--rex-text-muted)" }}>· {payload.stipend}</span>
          )}
          {payload.location && (
            <span style={{ color: "var(--rex-text-dim)" }}>· {payload.location}</span>
          )}
          {!expired && (
            <span className="ml-auto inline-flex items-center gap-1">
              <DeadlineChip
                deadline={payload.nextDeadline}
                rolling={payload.rolling}
              />
              {longDeadline && (
                <span style={{ color: "var(--rex-text-dim)" }}>· {longDeadline}</span>
              )}
            </span>
          )}
        </div>

        <h3 className="font-display text-lg text-white mb-1.5 group-hover:text-[var(--rex-accent)] transition-colors">
          {payload.name}
        </h3>

        <p className="text-sm text-[var(--rex-text-muted)] line-clamp-2 leading-relaxed">
          {payload.description}
        </p>

        {(payload.eligibility || payload.duration || payload.focus) && (
          <div
            className="mt-3 text-[10px] font-mono"
            style={{ color: "var(--rex-text-dim)" }}
          >
            {payload.eligibility && (
              <>
                Eligibility:{" "}
                <span className="text-[var(--rex-text-muted)]">
                  {payload.eligibility}
                </span>
              </>
            )}
            {payload.eligibility && (payload.duration || payload.focus) && " · "}
            {payload.duration && (
              <>
                Duration:{" "}
                <span className="text-[var(--rex-text-muted)]">
                  {payload.duration}
                </span>
              </>
            )}
            {payload.duration && payload.focus && " · "}
            {payload.focus && (
              <>
                Focus:{" "}
                <span className="text-[var(--rex-text-muted)]">{payload.focus}</span>
              </>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
