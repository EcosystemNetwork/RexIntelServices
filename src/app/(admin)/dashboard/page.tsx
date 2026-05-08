import { sql, desc, eq } from "drizzle-orm";
import { db, subscribers, campaigns } from "@/lib/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const [
    [{ active }],
    [{ unsubscribed }],
    [{ bounced }],
    [{ totalCampaigns }],
    recent,
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
  ]);

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

      <div className="grid grid-cols-4 gap-4 mb-10">
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
