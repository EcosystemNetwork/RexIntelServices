import Link from "next/link";
import { unstable_cache } from "next/cache";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, submissions } from "@/lib/db";
import type { GrantPayload } from "@/lib/db/schema";
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

const getGrantsRows = unstable_cache(
  async (intake: "rolling" | "deadline" | null) => {
    const filterClause =
      intake === "rolling"
        ? sql`(${submissions.payload}->>'rolling')::boolean = true`
        : intake === "deadline"
          ? sql`${submissions.payload}->>'deadline' IS NOT NULL`
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
          eq(submissions.type, "grant"),
          eq(submissions.status, "approved"),
          filterClause,
        ),
      )
      // Push expired-deadline rows to the bottom so the lane stays useful even
      // as old listings accumulate. NULL deadline (rolling / unspecified)
      // ranks alongside not-yet-expired rows.
      .orderBy(
        desc(submissions.featured),
        sql`((${submissions.payload}->>'deadline') IS NOT NULL AND (${submissions.payload}->>'deadline')::timestamptz < now()) ASC`,
        desc(submissions.publishedAt),
      )
      .limit(200);
  },
  ["intel-lane-grants-v2"],
  { tags: [SUBMISSIONS_TAG], revalidate: LISTING_REVALIDATE_SEC },
);

export async function GrantsLane({ filter }: { filter?: string }) {
  const intake =
    filter === "rolling" ? "rolling" : filter === "deadline" ? "deadline" : null;

  const rows = await getGrantsRows(intake);

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
  const expired = isDeadlinePassed(payload.deadline);
  const longDeadline =
    payload.deadline && !expired
      ? new Date(payload.deadline).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : null;

  const logo = logoUrlFor(payload.organizationUrl, payload.applyUrl);

  return (
    <Link
      href={detailHref("/grants", publicId, payload.name)}
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
        <div className="flex items-center gap-2 mb-2 text-[10px] font-mono uppercase tracking-widest">
          {featured && <FeaturedTag />}
          {expired && <ClosedTag />}
          <span style={{ color: "var(--rex-text-dim)" }}>{payload.organization}</span>
          {payload.amount && (
            <span style={{ color: "var(--rex-text-muted)" }}>· {payload.amount}</span>
          )}
          {!expired && (
            <span className="ml-auto inline-flex items-center gap-1">
              <DeadlineChip
                deadline={payload.deadline}
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

        {payload.focus && (
          <div
            className="mt-3 text-[10px] font-mono"
            style={{ color: "var(--rex-text-dim)" }}
          >
            Focus: <span className="text-[var(--rex-text-muted)]">{payload.focus}</span>
          </div>
        )}
      </div>
    </Link>
  );
}
