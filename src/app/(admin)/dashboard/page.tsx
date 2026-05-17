import { sql, desc, eq, and, gte } from "drizzle-orm";
import {
  db,
  subscribers,
  campaigns,
  subscriberTags,
  tags,
  submissions,
  addresses,
  intelAddresses,
  PERSONA_LABELS,
  type PersonaSlug,
  type IntelPayload,
} from "@/lib/db";
import Link from "next/link";
import {
  fetchPoolBalance,
  computePayouts,
  currentYearMonth,
  getMonthlyTopIntel,
} from "@/lib/prize-pool";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    [{ active }],
    [{ unsubscribed }],
    [{ bounced }],
    [{ totalCampaigns }],
    recent,
    personaRows,
    addressMetrics,
    intelKindRows,
    submissionVelocity,
  ] = await Promise.all([
    db
      .select({ active: sql<number>`count(*)::int` })
      .from(subscribers)
      .where(eq(subscribers.status, "active")),
    db
      .select({ unsubscribed: sql<number>`count(*)::int` })
      .from(subscribers)
      .where(eq(subscribers.status, "unsubscribed")),
    db
      .select({ bounced: sql<number>`count(*)::int` })
      .from(subscribers)
      .where(eq(subscribers.status, "bounced")),
    db.select({ totalCampaigns: sql<number>`count(*)::int` }).from(campaigns),
    db.select().from(campaigns).orderBy(desc(campaigns.createdAt)).limit(5),
    // Subscribers per persona — the wedge-targeting proof number. Counts
    // only `active` subscribers and only `persona`-kind tags so internal
    // interest tags don't muddy the picture.
    db
      .select({
        slug: tags.name,
        count: sql<number>`count(${subscriberTags.subscriberId})::int`,
      })
      .from(tags)
      .leftJoin(
        subscriberTags,
        eq(subscriberTags.tagId, tags.id),
      )
      .leftJoin(
        subscribers,
        and(
          eq(subscribers.id, subscriberTags.subscriberId),
          eq(subscribers.status, "active"),
        ),
      )
      .where(eq(tags.kind, "persona"))
      .groupBy(tags.name)
      .orderBy(desc(sql`count(${subscriberTags.subscriberId})`)),
    // Address graph velocity — the long-term moat metric. Total unique
    // addresses + total submission-address edges + last-7-day deltas.
    db
      .select({
        totalAddresses: sql<number>`(select count(*)::int from ${addresses})`,
        totalEdges: sql<number>`(select count(*)::int from ${intelAddresses})`,
        last7dAddresses: sql<number>`(select count(*)::int from ${addresses} where created_at >= ${sevenDaysAgo})`,
        last7dEdges: sql<number>`(select count(*)::int from ${intelAddresses} where added_at >= ${sevenDaysAgo})`,
      })
      .from(sql`(select 1) as _`),
    // Intel by kind — does the editorial bar actually have inventory? If
    // `original` + `incident` rows are zero, the digest cron will skip.
    db
      .select({
        kind: sql<string>`COALESCE(${submissions.payload}->>'kind', 'tip')`,
        count: sql<number>`count(*)::int`,
      })
      .from(submissions)
      .where(
        and(
          eq(submissions.type, "intel"),
          eq(submissions.status, "approved"),
        ),
      )
      .groupBy(sql`COALESCE(${submissions.payload}->>'kind', 'tip')`),
    // Last-7-day submission velocity per type — pace check for the day-90
    // proof story. Pending + approved both count (intent = velocity).
    db
      .select({
        type: submissions.type,
        count: sql<number>`count(*)::int`,
      })
      .from(submissions)
      .where(gte(submissions.createdAt, sevenDaysAgo))
      .groupBy(submissions.type)
      .orderBy(desc(sql`count(*)`)),
  ]);

  const addr = addressMetrics[0] ?? {
    totalAddresses: 0,
    totalEdges: 0,
    last7dAddresses: 0,
    last7dEdges: 0,
  };

  const intelKindCounts = new Map<string, number>(
    intelKindRows.map((r) => [r.kind, r.count]),
  );
  const originalCount =
    (intelKindCounts.get("original") ?? 0) +
    (intelKindCounts.get("incident") ?? 0);
  const tipCount = intelKindCounts.get("tip") ?? 0;

  // Prize pool snapshot — current balance + this month's top 3 (shared
  // with the public intel-page banner via getMonthlyTopIntel so the two
  // surfaces can't drift).
  const ym = currentYearMonth();
  const [pool, monthTop3] = await Promise.all([
    fetchPoolBalance(),
    getMonthlyTopIntel({ yearMonth: ym, limit: 3 }),
  ]);

  const payouts = computePayouts(pool.amount);
  const placeAmounts = [payouts.place1, payouts.place2, payouts.place3];

  return (
    <div className="p-10 max-w-6xl">
      <header className="mb-10">
        <p
          className="text-xs uppercase tracking-widest mb-1"
          style={{ color: "var(--rex-text-dim)" }}
        >
          Command Center
        </p>
        <h1 className="font-display text-4xl font-medium text-white">
          Dashboard
        </h1>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <div className="rex-stat accent">
          <div className="rex-stat-label">Active Subscribers</div>
          <div className="rex-stat-value">{active.toLocaleString()}</div>
        </div>
        <div className="rex-stat">
          <div className="rex-stat-label">Unsubscribed</div>
          <div className="rex-stat-value">{unsubscribed.toLocaleString()}</div>
        </div>
        <div className="rex-stat">
          <div className="rex-stat-label">Bounced</div>
          <div className="rex-stat-value">{bounced.toLocaleString()}</div>
        </div>
        <div className="rex-stat">
          <div className="rex-stat-label">Campaigns</div>
          <div className="rex-stat-value">
            {totalCampaigns.toLocaleString()}
          </div>
        </div>
      </div>

      {/*
        Community prize pool — the monthly intel bounty. Surfaces the
        current on-chain balance + the top 3 intel of the month so the
        admin can see "who would win if we settled right now" + has the
        submitter email needed to pay them out.
      */}
      <section className="mb-10">
        <p
          className="text-xs uppercase tracking-widest mb-3"
          style={{ color: "var(--rex-text-dim)" }}
        >
          ▸ Prize pool · {ym}
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="rex-card p-5">
            <div className="rex-stat-label mb-2">Current pool</div>
            <div className="font-display text-3xl text-white tabular-nums">
              {formatMoney(pool.amount)}{" "}
              <span
                className="text-xs font-mono"
                style={{ color: "var(--rex-text-dim)" }}
              >
                {pool.asset} ({pool.source})
              </span>
            </div>
            <div
              className="mt-3 text-[11px] font-mono"
              style={{ color: "var(--rex-text-dim)" }}
            >
              1st {formatMoney(payouts.place1)} · 2nd{" "}
              {formatMoney(payouts.place2)} · 3rd{" "}
              {formatMoney(payouts.place3)} ·{" "}
              <span style={{ color: "var(--rex-accent)" }}>
                rollover {formatMoney(payouts.rollover)}
              </span>
            </div>
          </div>

          <div className="rex-card lg:col-span-2 p-5">
            <div className="rex-stat-label mb-3">Top 3 this month</div>
            {monthTop3.length === 0 ? (
              <div
                className="text-xs"
                style={{ color: "var(--rex-text-dim)" }}
              >
                No votes recorded this month yet.
              </div>
            ) : (
              <ol className="space-y-2">
                {monthTop3.map((row, i) => {
                  const p = row.payload as IntelPayload;
                  const isAnonymous = p.anonymous === true;
                  return (
                    <li
                      key={row.publicId}
                      className="flex items-baseline gap-3 text-sm"
                    >
                      <span
                        className="font-mono w-5 text-right"
                        style={{ color: "var(--rex-accent)" }}
                      >
                        {i + 1}.
                      </span>
                      <Link
                        href={`/submissions?q=${row.publicId}`}
                        className="flex-1 min-w-0 text-white hover:text-[var(--rex-accent)] truncate"
                      >
                        {p.headline}
                      </Link>
                      <span
                        className="font-mono text-[11px]"
                        style={{ color: "var(--rex-text-muted)" }}
                      >
                        {row.voteCount} {row.voteCount === 1 ? "vote" : "votes"}
                      </span>
                      <span
                        className="font-mono text-[11px]"
                        style={{ color: "var(--rex-text-dim)" }}
                      >
                        →{" "}
                        {isAnonymous
                          ? "anon · rolls"
                          : row.submitterEmail
                            ? `${formatMoney(placeAmounts[i] ?? "0")}`
                            : "no email · rolls"}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
            <div
              className="mt-3 text-[11px] font-mono"
              style={{ color: "var(--rex-text-dim)" }}
            >
              Anonymous + no-email winners forfeit; their share rolls to
              next month.
            </div>
          </div>
        </div>
      </section>

      {/*
        Moat metrics — the day-90 proof surface. These four blocks track
        the three things the 90-day plan committed to:
          (1) audience growth per buyer persona,
          (2) address-graph velocity (the long-term moat),
          (3) editorial-bar inventory (original signal vs. tips).
      */}
      <section className="mb-10">
        <p
          className="text-xs uppercase tracking-widest mb-3"
          style={{ color: "var(--rex-text-dim)" }}
        >
          ▸ Moat metrics
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <div className="rex-card p-5">
            <div className="rex-stat-label mb-3">
              Subscribers by persona
            </div>
            {personaRows.length === 0 ? (
              <div
                className="text-xs"
                style={{ color: "var(--rex-text-dim)" }}
              >
                No persona tags seeded yet.
              </div>
            ) : (
              <ul className="space-y-1.5">
                {personaRows.map((r) => {
                  const label =
                    PERSONA_LABELS[r.slug as PersonaSlug] ?? r.slug;
                  return (
                    <li
                      key={r.slug}
                      className="flex items-baseline justify-between text-sm"
                    >
                      <span style={{ color: "var(--rex-text-muted)" }}>
                        {label}
                      </span>
                      <span className="font-mono text-white">
                        {r.count.toLocaleString()}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="rex-card p-5">
            <div className="rex-stat-label mb-3">Address graph</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div
                  className="text-[10px] font-mono uppercase tracking-widest"
                  style={{ color: "var(--rex-text-dim)" }}
                >
                  Unique addresses
                </div>
                <div className="font-display text-2xl text-white">
                  {addr.totalAddresses.toLocaleString()}
                </div>
                <div
                  className="text-[11px] font-mono mt-0.5"
                  style={{ color: "var(--rex-accent)" }}
                >
                  +{addr.last7dAddresses.toLocaleString()} (7d)
                </div>
              </div>
              <div>
                <div
                  className="text-[10px] font-mono uppercase tracking-widest"
                  style={{ color: "var(--rex-text-dim)" }}
                >
                  Intel → address edges
                </div>
                <div className="font-display text-2xl text-white">
                  {addr.totalEdges.toLocaleString()}
                </div>
                <div
                  className="text-[11px] font-mono mt-0.5"
                  style={{ color: "var(--rex-accent)" }}
                >
                  +{addr.last7dEdges.toLocaleString()} (7d)
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rex-card p-5">
            <div className="rex-stat-label mb-3">Intel inventory by kind</div>
            <ul className="space-y-1.5 text-sm">
              <li className="flex items-baseline justify-between">
                <span style={{ color: "var(--rex-text-muted)" }}>
                  Original + Incident
                  <span
                    className="ml-2 text-[10px] font-mono uppercase tracking-widest"
                    style={{
                      color:
                        originalCount > 0
                          ? "var(--rex-accent)"
                          : "var(--rex-danger)",
                    }}
                  >
                    {originalCount > 0
                      ? "Editorial bar OK"
                      : "Bar not met — digest will skip"}
                  </span>
                </span>
                <span className="font-mono text-white">
                  {originalCount.toLocaleString()}
                </span>
              </li>
              <li className="flex items-baseline justify-between">
                <span style={{ color: "var(--rex-text-muted)" }}>
                  Tips (community)
                </span>
                <span className="font-mono text-white">
                  {tipCount.toLocaleString()}
                </span>
              </li>
            </ul>
          </div>

          <div className="rex-card p-5">
            <div className="rex-stat-label mb-3">
              Submission velocity (last 7d)
            </div>
            {submissionVelocity.length === 0 ? (
              <div
                className="text-xs"
                style={{ color: "var(--rex-text-dim)" }}
              >
                No submissions in the last 7 days.
              </div>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {submissionVelocity.map((r) => (
                  <li
                    key={r.type}
                    className="flex items-baseline justify-between"
                  >
                    <span
                      style={{ color: "var(--rex-text-muted)" }}
                      className="capitalize"
                    >
                      {r.type.replace("_", " ")}
                    </span>
                    <span className="font-mono text-white">
                      {r.count.toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-display text-2xl font-medium text-white">
            Recent Campaigns
          </h2>
          <Link href="/campaigns/new" className="rex-btn text-sm">
            New campaign
          </Link>
        </div>

        {recent.length === 0 ? (
          <div
            className="border border-dashed rounded-lg p-12 text-center bg-grid"
            style={{
              borderColor: "var(--rex-border)",
              color: "var(--rex-text-dim)",
            }}
          >
            No campaigns yet. Create your first one.
          </div>
        ) : (
          <div className="rex-card">
            <table className="rex-table">
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Sent</th>
                  <th style={{ textAlign: "right" }}>Opens</th>
                  <th style={{ textAlign: "right" }}>Clicks</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className="font-medium text-white">{c.name}</div>
                      <div
                        className="text-xs mt-0.5"
                        style={{ color: "var(--rex-text-dim)" }}
                      >
                        {c.subject}
                      </div>
                    </td>
                    <td>
                      <span className={`pill pill-${c.status}`}>
                        {c.status}
                      </span>
                    </td>
                    <td
                      className="text-right font-mono text-xs"
                      style={{ color: "var(--rex-text-muted)" }}
                    >
                      {c.sentCount ?? 0}
                    </td>
                    <td
                      className="text-right font-mono text-xs"
                      style={{ color: "var(--rex-text-muted)" }}
                    >
                      {c.openedCount ?? 0}
                    </td>
                    <td
                      className="text-right font-mono text-xs"
                      style={{ color: "var(--rex-text-muted)" }}
                    >
                      {c.clickedCount ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function formatMoney(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
