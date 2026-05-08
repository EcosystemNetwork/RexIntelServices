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
          <p className="text-xs uppercase tracking-widest text-neutral-500 mb-1">
            Outbox
          </p>
          <h1 className="font-display text-4xl font-medium">Campaigns</h1>
        </div>
        <Link
          href="/campaigns/new"
          className="bg-black text-white text-sm px-4 py-2 rounded-md hover:bg-neutral-800"
        >
          New campaign
        </Link>
      </header>

      {rows.length === 0 ? (
        <div className="border border-dashed border-neutral-300 rounded-lg p-16 text-center text-neutral-500 bg-grid">
          <p className="font-display text-xl mb-1">Nothing here yet</p>
          <p className="text-sm">Create your first campaign to start sending.</p>
        </div>
      ) : (
        <div className="border border-neutral-200 rounded-lg overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-medium">Campaign</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Sent</th>
                <th className="px-4 py-3 font-medium text-right">Opened</th>
                <th className="px-4 py-3 font-medium text-right">Clicked</th>
                <th className="px-4 py-3 font-medium text-right">Bounced</th>
                <th className="px-4 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/campaigns/new?id=${c.id}`}
                      className="font-medium hover:underline"
                    >
                      {c.name}
                    </Link>
                    <div className="text-xs text-neutral-500">{c.subject}</div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={c.status} />
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs">
                    {c.sentCount ?? 0}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs">
                    {c.openedCount ?? 0}{" "}
                    <span className="text-neutral-400">
                      ({pct(c.openedCount, c.sentCount)})
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs">
                    {c.clickedCount ?? 0}{" "}
                    <span className="text-neutral-400">
                      ({pct(c.clickedCount, c.sentCount)})
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs">
                    {c.bouncedCount ?? 0}
                  </td>
                  <td className="px-4 py-3 text-neutral-500 text-xs">
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
