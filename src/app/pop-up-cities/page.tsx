import Link from "next/link";
import type { Metadata } from "next";
import { and, asc, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db, submissions } from "@/lib/db";
import type { PopupCityPayload } from "@/lib/db/schema";
import { ResourceListShell, EmptyState } from "@/components/resource-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pop-Up Cities — Rex Intel Services",
  description:
    "Multi-week pop-up residencies — Zuzalu-style gatherings for builders, researchers, and operators.",
  openGraph: {
    title: "Pop-Up Cities — Rex Intel Services",
    description:
      "Multi-week pop-up residencies — Zuzalu-style gatherings for builders, researchers, and operators.",
    type: "website",
  },
};

export default async function PopUpCitiesPage({
  searchParams,
}: {
  searchParams: { view?: string };
}) {
  const showPast = searchParams.view === "past";
  const now = new Date();

  const baseFilter = and(
    eq(submissions.type, "popup_city"),
    eq(submissions.status, "approved"),
  );

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
          showPast
            ? lt(submissions.eventStartsAt, now)
            : gte(submissions.eventStartsAt, now),
        ),
      )
      .orderBy(
        ...(showPast
          ? [desc(submissions.eventStartsAt)]
          : [desc(submissions.featured), asc(submissions.eventStartsAt)]),
      )
      .limit(100),
    db
      .select({ upcomingCount: sql<number>`count(*)::int` })
      .from(submissions)
      .where(and(baseFilter, gte(submissions.eventStartsAt, now))),
    db
      .select({ pastCount: sql<number>`count(*)::int` })
      .from(submissions)
      .where(and(baseFilter, lt(submissions.eventStartsAt, now))),
  ]);

  const visible = visibleRows.map((r) => ({
    ...r,
    payload: r.payload as PopupCityPayload,
  }));

  return (
    <ResourceListShell
      classification={[
        { text: "● Open Channel // Pop-Up Residencies" },
        { text: "Multi-week Gatherings / Apply", show: "sm" },
      ]}
      kicker="▸ Pop-Up Cities"
      title="Show up, build together."
      subtitle="Multi-week residencies — Zuzalu, Edge City, Crecimiento and the next generation of pop-up gatherings. Application-based intake."
      submitHref="/submit?type=popup_city"
      submitLabel="+ Add City ▸"
      pasteHint={
        <>
          Hosting a residency?{" "}
          <Link
            href="/submit?type=popup_city"
            className="text-[var(--rex-accent)] hover:text-white transition-colors underline decoration-dotted underline-offset-2"
          >
            Submit it
          </Link>{" "}
          — events on lu.ma, edgecity.live, zuzalu.city publish instantly.
        </>
      }
      filters={
        <div className="flex gap-2">
          <ViewTab href="/pop-up-cities" active={!showPast}>
            Upcoming · {upcomingCount}
          </ViewTab>
          <ViewTab href="/pop-up-cities?view=past" active={showPast}>
            Past · {pastCount}
          </ViewTab>
        </div>
      }
    >
      {visible.length === 0 ? (
        <EmptyState>
          {showPast
            ? "No past pop-up cities on file."
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
    </ResourceListShell>
  );
}

function ViewTab({
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
      className="px-3 py-1.5 rounded-sm text-xs font-mono uppercase tracking-widest transition-all"
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
        <div className="text-[9px] font-mono uppercase tracking-widest" style={{ color: "var(--rex-text-dim)" }}>
          {start.toLocaleDateString(undefined, { month: "short" })}
        </div>
        <div className="text-xl font-display text-white leading-none">{start.getDate()}</div>
        <div className="text-[9px] font-mono uppercase tracking-widest mt-0.5" style={{ color: "var(--rex-text-dim)" }}>
          → {end.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 text-[10px] font-mono uppercase tracking-widest flex-wrap">
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
          {payload.organization && (
            <span style={{ color: "var(--rex-text-dim)" }}>{payload.organization}</span>
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

function formatRange(start: Date, end: Date): string {
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const startLabel = start.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const endLabel = sameMonth
    ? end.toLocaleDateString(undefined, { day: "numeric", year: "numeric" })
    : end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return `${startLabel}–${endLabel}`;
}
