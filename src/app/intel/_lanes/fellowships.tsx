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
  FilterBar,
  OrgLogo,
  FeaturedTag,
  PasteHint,
  isDeadlinePassed,
  parseSector,
  sectorClause,
  closingSoonClause,
  formatUsd,
  parseFundingFloor,
  FUNDING_BUCKETS,
  type Sector,
  type FundingFloor,
} from "./_shared";

const INTAKE_LABEL: Record<Exclude<Intake, null>, string> = {
  rolling: "Rolling",
  scheduled: "Scheduled cohort",
  soon: "Closing ≤14d",
};
const SECTOR_LABEL: Record<Sector, string> = {
  web3: "Web3",
  ai: "AI & Robotics",
};

type Intake = "rolling" | "scheduled" | "soon" | null;

const getFellowshipsRows = unstable_cache(
  async (intake: Intake, sector: Sector | null, minUsd: FundingFloor) => {
    const intakeClause =
      intake === "rolling"
        ? sql`(${submissions.payload}->>'rolling')::boolean = true`
        : intake === "scheduled"
          ? sql`${submissions.payload}->>'nextDeadline' IS NOT NULL`
          : intake === "soon"
            ? closingSoonClause(true, "nextDeadline")
            : sql`true`;
    const fundingClause =
      minUsd > 0
        ? sql`COALESCE(NULLIF(${submissions.payload}->>'stipendUsd', ''), '0')::numeric >= ${minUsd}`
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
          intakeClause,
          fundingClause,
          sectorClause(sector, ["focus", "description", "name", "eligibility"]),
        ),
      )
      .orderBy(
        desc(submissions.featured),
        sql`((${submissions.payload}->>'nextDeadline') IS NOT NULL AND (${submissions.payload}->>'nextDeadline')::timestamptz < now()) ASC`,
        desc(submissions.publishedAt),
      )
      .limit(200);
  },
  ["intel-lane-fellowships-v3"],
  { tags: [SUBMISSIONS_TAG], revalidate: LISTING_REVALIDATE_SEC },
);

export async function FellowshipsLane({
  filter,
  sector: sectorParam,
  soon,
  minUsd: minUsdParam,
}: {
  filter?: string;
  sector?: string;
  soon?: string;
  minUsd?: string;
}) {
  const intake: Intake =
    soon === "1"
      ? "soon"
      : filter === "rolling"
        ? "rolling"
        : filter === "scheduled"
          ? "scheduled"
          : null;
  const sector = parseSector(sectorParam);
  const minUsd = parseFundingFloor(minUsdParam);

  const rows = await getFellowshipsRows(intake, sector, minUsd);

  const visible = rows.map((r) => ({
    ...r,
    payload: r.payload as FellowshipPayload,
  }));

  const href = (next: {
    intake?: Intake;
    sector?: Sector | null;
    minUsd?: FundingFloor;
  }) => {
    const params = new URLSearchParams({ lane: "fellowships" });
    const ni = next.intake !== undefined ? next.intake : intake;
    const ns = next.sector !== undefined ? next.sector : sector;
    const nu = next.minUsd !== undefined ? next.minUsd : minUsd;
    if (ni === "soon") params.set("soon", "1");
    else if (ni) params.set("filter", ni);
    if (ns) params.set("sector", ns);
    if (nu > 0) params.set("minUsd", String(nu));
    return `/intel?${params.toString()}`;
  };

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

      <FilterBar
        summary={
          [
            sector ? SECTOR_LABEL[sector] : null,
            intake ? INTAKE_LABEL[intake] : null,
            minUsd > 0 ? `${formatUsd(minUsd)}+` : null,
          ]
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
            INTAKE ▸
          </span>
          <Chip href={href({ intake: null })} active={!intake}>
            All
          </Chip>
          <Chip href={href({ intake: "rolling" })} active={intake === "rolling"}>
            Rolling
          </Chip>
          <Chip
            href={href({ intake: "scheduled" })}
            active={intake === "scheduled"}
          >
            Scheduled cohort
          </Chip>
          <Chip href={href({ intake: "soon" })} active={intake === "soon"}>
            Closing ≤14d
          </Chip>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          <span
            className="uppercase tracking-widest"
            style={{ color: "var(--rex-text-dim)" }}
          >
            STIPEND ▸
          </span>
          {FUNDING_BUCKETS.map((b) => (
            <Chip
              key={b.value}
              href={href({ minUsd: b.value })}
              active={minUsd === b.value}
            >
              {b.label}
            </Chip>
          ))}
        </div>
      </FilterBar>

      {visible.length === 0 ? (
        <EmptyState>No fellowship programs match this filter yet.</EmptyState>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
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
          {typeof payload.stipendUsd === "number" && payload.stipendUsd > 0 && (
            <span
              className="px-1.5 py-0.5 rounded-sm"
              style={{
                background: "rgba(95,185,31,0.12)",
                color: "var(--rex-accent)",
                border: "1px solid rgba(95,185,31,0.45)",
              }}
            >
              ⌬ {formatUsd(payload.stipendUsd)}
            </span>
          )}
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
