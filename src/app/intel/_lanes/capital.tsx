import Link from "next/link";
import { unstable_cache } from "next/cache";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, submissions } from "@/lib/db";
import type { CapitalPayload } from "@/lib/db/schema";
import { detailHref } from "@/lib/slug";
import { logoUrlFor } from "@/lib/logo";
import { SUBMISSIONS_TAG, LISTING_REVALIDATE_SEC } from "@/lib/cache";
import { Chip, EmptyState, OrgLogo, FeaturedTag, PasteHint } from "./_shared";

const getCapitalRows = unstable_cache(
  async (stage: "pre-seed" | "seed" | null) => {
    const filterClause =
      stage === "pre-seed"
        ? sql`LOWER(${submissions.payload}->>'stage') LIKE '%pre-seed%'`
        : stage === "seed"
          ? sql`LOWER(${submissions.payload}->>'stage') LIKE '%seed%' AND LOWER(${submissions.payload}->>'stage') NOT LIKE '%pre-seed%'`
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
          eq(submissions.type, "capital"),
          eq(submissions.status, "approved"),
          filterClause,
        ),
      )
      .orderBy(desc(submissions.featured), desc(submissions.publishedAt))
      .limit(200);
  },
  ["intel-lane-capital-v1"],
  { tags: [SUBMISSIONS_TAG], revalidate: LISTING_REVALIDATE_SEC },
);

export async function CapitalLane({ filter }: { filter?: string }) {
  // Stage filter narrows the list — most readers shopping for first-check
  // capital are at one specific stage at a time, so this is the highest-value
  // pivot.
  const stage =
    filter === "pre-seed"
      ? "pre-seed"
      : filter === "seed"
        ? "seed"
        : null;

  const rows = await getCapitalRows(stage);

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
  const logo = logoUrlFor(payload.organizationUrl, payload.pitchUrl);

  return (
    <Link
      href={detailHref("/capital", publicId, payload.name)}
      className="rex-card flex gap-4 p-5 hover:bg-[var(--rex-surface-2)] transition-colors group"
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
      <OrgLogo src={logo} org={payload.organization} />

      <div className="flex-1 min-w-0">
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
      </div>
    </Link>
  );
}
