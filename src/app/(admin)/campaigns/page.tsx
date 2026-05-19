"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Campaign {
  id: string;
  name: string;
  subject: string;
  status: string;
  sentCount: number | null;
  openedCount: number | null;
  clickedCount: number | null;
  bouncedCount: number | null;
  recipientCount: number | null;
  scheduledFor: string | null;
  sentAt: string | null;
  createdAt: string;
  progressStartedAt: string | null;
}

export default function CampaignsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/campaigns");
    const data = await res.json();
    setRows(data.campaigns ?? []);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  // While any campaign is sending, refresh the list every 5s so the inline
  // progress bars reflect the worker's per-minute tick. Stop the moment
  // nothing is mid-send.
  useEffect(() => {
    const anySending = rows.some((r) => r.status === "sending");
    if (!anySending) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [rows]);

  async function duplicate(id: string) {
    setBusyId(id);
    const res = await fetch(`/api/campaigns/${id}/duplicate`, {
      method: "POST",
    });
    setBusyId(null);
    if (!res.ok) {
      alert("duplicate failed");
      return;
    }
    const data = await res.json();
    router.push(`/campaigns/new?id=${data.campaign.id}`);
  }

  async function remove(id: string, status: string) {
    if (status === "sent" || status === "sending") {
      alert(`cannot delete a ${status} campaign`);
      return;
    }
    if (!confirm("Delete this draft? This is permanent.")) return;
    setBusyId(id);
    const res = await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
    setBusyId(null);
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      alert(e.error ?? "delete failed");
      return;
    }
    load();
  }

  return (
    <div className="p-10 max-w-7xl">
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

      {loading ? (
        <div
          className="text-center py-20"
          style={{ color: "var(--rex-text-dim)" }}
        >
          Loading…
        </div>
      ) : rows.length === 0 ? (
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
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link
                      href={
                        c.status === "draft" || c.status === "scheduled"
                          ? `/campaigns/new?id=${c.id}`
                          : `/campaigns/${c.id}`
                      }
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
                    {c.status === "scheduled" && c.scheduledFor && (
                      <div
                        className="text-xs mt-0.5 font-mono"
                        style={{ color: "var(--rex-accent)" }}
                      >
                        ⏱ {new Date(c.scheduledFor).toLocaleString()}
                      </div>
                    )}
                  </td>
                  <td>
                    <span className={`pill pill-${c.status}`}>{c.status}</span>
                  </td>
                  <td
                    className="text-right font-mono text-xs"
                    style={{ color: "var(--rex-text-muted)" }}
                  >
                    {c.status === "sending" && (c.recipientCount ?? 0) > 0 ? (
                      <div className="flex flex-col items-end gap-1">
                        <span>
                          {(c.sentCount ?? 0).toLocaleString()}
                          <span style={{ color: "var(--rex-text-dim)" }}>
                            /{c.recipientCount?.toLocaleString()}
                          </span>
                        </span>
                        <div
                          className="h-1 rounded-full overflow-hidden"
                          style={{
                            width: 60,
                            background: "rgba(95,185,31,0.15)",
                          }}
                        >
                          <div
                            className="h-full transition-all duration-500"
                            style={{
                              width: `${
                                ((c.sentCount ?? 0) /
                                  Math.max(1, c.recipientCount ?? 1)) *
                                100
                              }%`,
                              background: "var(--rex-accent)",
                            }}
                          />
                        </div>
                      </div>
                    ) : (
                      c.sentCount ?? 0
                    )}
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
                  <td className="text-right whitespace-nowrap">
                    <button
                      onClick={() => duplicate(c.id)}
                      disabled={busyId === c.id}
                      className="text-xs hover:text-white mr-3"
                      style={{ color: "var(--rex-text-dim)" }}
                    >
                      Duplicate
                    </button>
                    {c.status !== "sent" && c.status !== "sending" && (
                      <button
                        onClick={() => remove(c.id, c.status)}
                        disabled={busyId === c.id}
                        className="text-xs hover:text-[var(--rex-danger)]"
                        style={{ color: "var(--rex-text-dim)" }}
                      >
                        Delete
                      </button>
                    )}
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
