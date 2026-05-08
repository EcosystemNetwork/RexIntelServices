import { db, campaigns } from "@/lib/db";
import { desc } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const rows = await db
    .select()
    .from(campaigns)
    .orderBy(desc(campaigns.createdAt));

  return (
    <div className="p-10 max-w-6xl">
      <header className="mb-8 flex items-end justify-between">
        <div>
          <p
            className="text-xs uppercase tracking-widest mb-1"
            style={{ color: "var(--rex-text-dim)" }}
          >
            Outbox
          </p>
          <h1 className="font-display text-4xl font-medium text-white">
            Campaigns
          </h1>
        </div>
        <Link href="/campaigns/new" className="rex-btn">
          New campaign
        </Link>
      </header>

      {rows.length === 0 ? (
        <div
          className="border border-dashed rounded-lg p-16 text-center bg-grid"
          style={{
            borderColor: "var(--rex-border)",
            color: "var(--rex-text-dim)",
          }}
        >
          <p className="font-display text-xl mb-1 text-white">
            Nothing here yet
          </p>
          <p className="text-sm" style={{ color: "var(--rex-text-muted)" }}>
            Create your first campaign to start sending.
          </p>
        </div>
      ) : (
        <div className="rex-card">
          <table className="rex-table">
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Sent</th>
                <th style={{ textAlign: "right" }}>Opened</th>
                <th style={{ textAlign: "right" }}>Clicked</th>
                <th style={{ textAlign: "right" }}>Bounced</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link
                      href={`/campaigns/new?id=${c.id}`}
                      className="font-medium text-white hover:text-[var(--rex-accent)]"
                    >
                      {c.name}
                    </Link>
                    <div
                      className="text-xs mt-0.5"
                      style={{ color: "var(--rex-text-dim)" }}
                    >
                      {c.subject}
                    </div>
                  </td>
                  <td>
                    <span className={`pill pill-${c.status}`}>{c.status}</span>
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
                    {c.openedCount ?? 0}{" "}
                    <span style={{ color: "var(--rex-text-dim)" }}>
                      ({pct(c.openedCount, c.sentCount)})
                    </span>
                  </td>
                  <td
                    className="text-right font-mono text-xs"
                    style={{ color: "var(--rex-text-muted)" }}
                  >
                    {c.clickedCount ?? 0}{" "}
                    <span style={{ color: "var(--rex-text-dim)" }}>
                      ({pct(c.clickedCount, c.sentCount)})
                    </span>
                  </td>
                  <td
                    className="text-right font-mono text-xs"
                    style={{ color: "var(--rex-text-muted)" }}
                  >
                    {c.bouncedCount ?? 0}
                  </td>
                  <td
                    className="text-xs"
                    style={{ color: "var(--rex-text-dim)" }}
                  >
                    {new Date(c.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function pct(n: number | null, d: number | null): string {
  if (!n || !d || d === 0) return "0%";
  return `${Math.round((n / d) * 100)}%`;
}
