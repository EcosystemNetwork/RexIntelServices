import Link from "next/link";
import { unstable_cache } from "next/cache";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, submissions } from "@/lib/db";
import type { CapitalPayload } from "@/lib/db/schema";
import { detailHref } from "@/lib/slug";
import { logoUrlFor } from "@/lib/logo";
import { SUBMISSIONS_TAG, LISTING_REVALIDATE_SEC } from "@/lib/cache";
import {
  Chip,
  EmptyState,
  FilterBar,
  OrgLogo,
  FeaturedTag,
  PasteHint,
  parseSector,
  sectorClause,
  type Sector,
} from "./_shared";

const STAGE_LABEL: Record<Exclude<Stage, null>, string> = {
  "pre-seed": "Pre-seed",
  seed: "Seed",
};
const SECTOR_LABEL: Record<Sector, string> = {
  web3: "Web3",
  ai: "AI & Robotics",
};

type Stage = "pre-seed" | "seed" | null;

const getCapitalRows = unstable_cache(
  async (stage: Stage, sector: Sector | null) => {
    const stageClause =
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
          stageClause,
          sectorClause(sector, ["focus", "description", "name"]),
        ),
      )
      .orderBy(desc(submissions.featured), desc(submissions.publishedAt))
      .limit(200);
  },
  ["intel-lane-capital-v2"],
  { tags: [SUBMISSIONS_TAG], revalidate: LISTING_REVALIDATE_SEC },
);

export async function CapitalLane({
  filter,
  sector: sectorParam,
}: {
  filter?: string;
  sector?: string;
}) {
  // Stage narrows by check round; sector narrows by thesis. Most founders are
  // shopping one stage AND one sector at a time, so both are first-class.
  const stage: Stage =
    filter === "pre-seed" ? "pre-seed" : filter === "seed" ? "seed" : null;
  const sector = parseSector(sectorParam);

  const rows = await getCapitalRows(stage, sector);

  const visible = rows.map((r) => ({ ...r, payload: r.payload as CapitalPayload }));

  const href = (next: { stage?: Stage; sector?: Sector | null }) => {
    const params = new URLSearchParams({ lane: "capital" });
    const ns = next.stage !== undefined ? next.stage : stage;
    const nsec = next.sector !== undefined ? next.sector : sector;
    if (ns) params.set("filter", ns);
    if (nsec) params.set("sector", nsec);
    return `/intel?${params.toString()}`;
  };

  return (
    <>
      <PasteHint>
        Run a fund taking cold pitches?{" "}
        <a
          href="mailto:hello@rexintelservices.com"
          className="text-[var(--rex-accent)] hover:text-[var(--rex-text)] transition-colors underline decoration-dotted underline-offset-2"
        >
          Email us
        </a>{" "}
        — we curate this lane manually so the bar stays high. No application form, no fees.
      </PasteHint>

      <FilterBar
        summary={
          [sector ? SECTOR_LABEL[sector] : null, stage ? STAGE_LABEL[stage] : null]
            .filter(Boolean)
            .join(" · ") || "All"
        }
      >
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          <span
            className="uppercase tracking-widest"
            style={{ color: "var(--rex-text-dim)" }}
          >
            SECTOR ▸
          </span>
          <Chip href={href({ sector: null })} active={!sector}>
            All
          </Chip>
          <Chip href={href({ sector: "web3" })} active={sector === "web3"}>
            Web3
          </Chip>
          <Chip href={href({ sector: "ai" })} active={sector === "ai"}>
            AI & Robotics
          </Chip>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          <span
            className="uppercase tracking-widest"
            style={{ color: "var(--rex-text-dim)" }}
          >
            STAGE ▸
          </span>
          <Chip href={href({ stage: null })} active={!stage}>
            All
          </Chip>
          <Chip href={href({ stage: "pre-seed" })} active={stage === "pre-seed"}>
            Pre-seed
          </Chip>
          <Chip href={href({ stage: "seed" })} active={stage === "seed"}>
            Seed
          </Chip>
        </div>
      </FilterBar>

      {visible.length === 0 ? (
        <EmptyState>No funds match this filter yet.</EmptyState>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
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

        <h3 className="font-display text-lg text-[var(--rex-text)] mb-1.5 group-hover:text-[var(--rex-accent)] transition-colors">
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
