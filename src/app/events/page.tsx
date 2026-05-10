import Link from "next/link";
import type { Metadata } from "next";
import { and, asc, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db, submissions } from "@/lib/db";
import type { EventPayload } from "@/lib/db/schema";
import { PublicShell } from "@/components/public-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Events — Rex Intel Services",
  description:
    "Curated calendar of crypto intelligence conferences, workshops, and closed-door sessions worth tracking.",
  openGraph: {
    title: "Events — Rex Intel Services",
    description:
      "Curated calendar of crypto intelligence conferences, workshops, and closed-door sessions worth tracking.",
    type: "website",
  },
};

export default async function EventsPage({
  searchParams,
}: {
  searchParams: { view?: string };
}) {
  const showPast = searchParams.view === "past";
  const now = new Date();

  const baseFilter = and(
    eq(submissions.type, "event"),
    eq(submissions.status, "approved"),
  );

  const [visibleRows, [{ upcomingCount }], [{ pastCount }]] =
    await Promise.all([
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
        // Pin featured rows to the top of upcoming; past view stays purely
        // chronological since featuring stale events doesn't help anyone.
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
    payload: r.payload as EventPayload,
  }));

  return (
    <PublicShell
      classification={[
        { text: "● Open Channel // Field Calendar" },
        { text: "Curated Events / Crypto Intel", show: "sm" },
      ]}
    >
      <main className="max-w-4xl mx-auto px-6 pt-8 md:pt-14 pb-24">
        <div className="mb-8">
          <p
            className="text-xs uppercase tracking-widest mb-2"
            style={{ color: "var(--rex-text-dim)" }}
          >
            ▸ Field Calendar
          </p>
          <h1 className="font-display text-4xl md:text-5xl font-semibold tracking-tight text-white mb-3">
            Events worth tracking.
          </h1>
          <p className="text-sm md:text-base text-[var(--rex-text-muted)] max-w-xl leading-relaxed">
            Conferences, workshops, closed-door sessions. Curated by RexIntel
            analysts and submitted by the field.{" "}
            <Link
              href="/submit"
              className="text-[var(--rex-accent)] hover:text-white transition-colors"
            >
              Know one we should add? →
            </Link>
          </p>
        </div>

        <div className="flex gap-2 mb-6">
          <ViewTab href="/events" active={!showPast}>
            Upcoming · {upcomingCount}
          </ViewTab>
          <ViewTab href="/events?view=past" active={showPast}>
            Past · {pastCount}
          </ViewTab>
        </div>

        {visible.length === 0 ? (
          <div
            className="border border-dashed rounded-lg p-12 text-center bg-grid"
            style={{
              borderColor: "var(--rex-border)",
              color: "var(--rex-text-dim)",
            }}
          >
            {showPast
              ? "No past events on file yet."
              : "No upcoming events on file. Check back, or submit one."}
          </div>
        ) : (
          <div className="space-y-2">
            {visible.map((e) => (
              <EventCard
                key={e.id}
                publicId={e.publicId}
                payload={e.payload}
                featured={e.featured}
              />
            ))}
          </div>
        )}
      </main>
    </PublicShell>
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

function EventCard({
  publicId,
  payload,
  featured = false,
}: {
  publicId: string;
  payload: EventPayload;
  featured?: boolean;
}) {
  const start = new Date(payload.startsAt);
  const dateLabel = start.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const monthLabel = start.toLocaleDateString(undefined, { month: "short" });
  const dayLabel = start.getDate();

  const location = [payload.city, payload.country].filter(Boolean).join(", ");

  return (
    <Link
      href={`/events/${publicId}`}
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
        className="flex-shrink-0 w-14 h-14 rounded-sm flex flex-col items-center justify-center border"
        style={{
          background: "var(--rex-bg)",
          borderColor: "var(--rex-border)",
        }}
      >
        <div
          className="text-[10px] font-mono uppercase tracking-widest"
          style={{ color: "var(--rex-text-dim)" }}
        >
          {monthLabel}
        </div>
        <div className="text-xl font-display text-white leading-none">
          {dayLabel}
        </div>
      </div>

      {payload.imageUrl && (
        <div
          className="hidden sm:block flex-shrink-0 h-14 w-24 rounded-sm overflow-hidden border"
          style={{
            background: "var(--rex-bg)",
            borderColor: "var(--rex-border)",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={payload.imageUrl}
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          {featured && (
            <span
              className="text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded-sm"
              style={{
                background: "rgba(95,185,31,0.12)",
                color: "var(--rex-accent)",
                border: "1px solid rgba(95,185,31,0.45)",
              }}
            >
              ★ Featured
            </span>
          )}
          {payload.eventType && (
            <span
              className="text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded-sm"
              style={{
                background: "rgba(31,168,224,0.1)",
                color: "var(--rex-accent-2)",
                border: "1px solid rgba(31,168,224,0.25)",
              }}
            >
              {payload.eventType}
            </span>
          )}
          {payload.priceTier && (
            <span
              className="text-[10px] font-mono uppercase tracking-widest"
              style={{ color: "var(--rex-text-dim)" }}
            >
              · {payload.priceTier}
            </span>
          )}
        </div>
        <div className="text-white text-base font-medium truncate group-hover:text-[var(--rex-accent)] transition-colors">
          {payload.name}
        </div>
        <div
          className="text-xs mt-0.5 font-mono"
          style={{ color: "var(--rex-text-dim)" }}
        >
          {dateLabel}
          {location && ` · ${location}`}
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
