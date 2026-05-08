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
        <p className="text-xs uppercase tracking-widest text-neutral-500 mb-1">
          Overview
        </p>
        <h1 className="font-display text-4xl font-medium">Dashboard</h1>
      </header>

      <div className="grid grid-cols-4 gap-4 mb-10">
        <Stat label="Active subscribers" value={active} accent />
        <Stat label="Unsubscribed" value={unsubscribed} />
        <Stat label="Bounced" value={bounced} />
        <Stat label="Campaigns" value={totalCampaigns} />
      </div>

      <section>
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-display text-2xl font-medium">Recent campaigns</h2>
          <Link
            href="/campaigns/new"
            className="text-sm bg-black text-white px-3 py-1.5 rounded-md hover:bg-neutral-800"
          >
            New campaign
          </Link>
        </div>

        {recent.length === 0 ? (
          <div className="border border-dashed border-neutral-300 rounded-lg p-12 text-center text-neutral-500 bg-grid">
            No campaigns yet. Create your first one.
          </div>
        ) : (
          <div className="border border-neutral-200 rounded-lg overflow-hidden bg-white">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wider text-neutral-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Campaign</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Sent</th>
                  <th className="px-4 py-3 font-medium text-right">Opens</th>
                  <th className="px-4 py-3 font-medium text-right">Clicks</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((c) => (
                  <tr key={c.id} className="border-t border-neutral-100">
                    <td className="px-4 py-3">
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-neutral-500">{c.subject}</div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={c.status} />
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs">
                      {c.sentCount ?? 0}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs">
                      {c.openedCount ?? 0}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs">
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

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div
      className={`border rounded-lg p-5 ${
        accent ? "bg-black text-white border-black" : "bg-white border-neutral-200"
      }`}
    >
      <div
        className={`text-xs uppercase tracking-wider mb-2 ${
          accent ? "text-neutral-400" : "text-neutral-500"
        }`}
      >
        {label}
      </div>
      <div className="font-display text-3xl font-semibold tabular-nums">
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "bg-neutral-100 text-neutral-700",
    scheduled: "bg-blue-50 text-blue-700",
    sending: "bg-amber-50 text-amber-700",
    sent: "bg-green-50 text-green-700",
    failed: "bg-red-50 text-red-700",
  };
  return (
    <span
      className={`inline-block px-2 py-0.5 text-xs rounded font-medium ${
        styles[status] ?? "bg-neutral-100"
      }`}
    >
      {status}
    </span>
  );
}
