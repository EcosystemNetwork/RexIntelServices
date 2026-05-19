"use client";

import { useEffect, useMemo, useState } from "react";

interface DailyRow {
  day: string;
  sent: number;
  bounced: number;
  complained: number;
  delivered: number;
}

interface Deliverability {
  window: { days: number; since: string };
  summary: {
    total: number;
    delivered: number;
    bounced: number;
    complained: number;
    opened: number;
    clicked: number;
    failed: number;
  };
  rates: {
    bounce: { value: number; status: "good" | "warn" | "danger" };
    complaint: { value: number; status: "good" | "warn" | "danger" };
    open: number;
    click: number;
  };
  thresholds: {
    bounceWarn: number;
    bounceBlock: number;
    complaintWarn: number;
    complaintBlock: number;
  };
  daily: DailyRow[];
  suppressions: {
    total: number;
    byReason: Array<{ reason: string; count: number }>;
  };
  topBounced: Array<{ email: string; count: number; lastBouncedAt: string }>;
  statusBreakdown: Array<{ status: string; count: number }>;
}

export default function DeliverabilityPage() {
  const [data, setData] = useState<Deliverability | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/deliverability");
      const d = await res.json();
      setData(d);
      setLoading(false);
    })();
  }, []);

  if (loading || !data) {
    return (
      <div className="p-10" style={{ color: "var(--rex-text-dim)" }}>
        Loading deliverability…
      </div>
    );
  }

  return (
    <div className="p-10 max-w-7xl">
      <header className="mb-8">
        <p
          className="text-xs uppercase tracking-widest mb-1"
          style={{ color: "var(--rex-text-dim)" }}
        >
          Sender reputation
        </p>
        <h1 className="font-display text-4xl font-medium text-white">
          Deliverability
        </h1>
        <p
          className="text-sm mt-2"
          style={{ color: "var(--rex-text-muted)" }}
        >
          Rolling {data.window.days}-day window. Two metrics matter most:
          Gmail spam-folders you above 0.4% bounce rate or 0.1% complaint rate.
        </p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <RateCard
          label="Bounce rate"
          value={data.rates.bounce.value}
          status={data.rates.bounce.status}
          ceiling={data.thresholds.bounceBlock}
        />
        <RateCard
          label="Complaint rate"
          value={data.rates.complaint.value}
          status={data.rates.complaint.status}
          ceiling={data.thresholds.complaintBlock}
        />
        <StatCard label="Open rate" value={pct(data.rates.open)} accent />
        <StatCard label="Click rate" value={pct(data.rates.click)} accent />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="rex-card p-5">
          <h3 className="text-sm font-medium text-white mb-1">
            Volume — last 30 days
          </h3>
          <p
            className="text-xs mb-4"
            style={{ color: "var(--rex-text-dim)" }}
          >
            {data.summary.total.toLocaleString()} sends ·{" "}
            {data.summary.bounced.toLocaleString()} bounces ·{" "}
            {data.summary.complained.toLocaleString()} complaints
          </p>
          <VolumeChart daily={data.daily} />
        </div>

        <div className="rex-card p-5">
          <h3 className="text-sm font-medium text-white mb-1">Subscribers</h3>
          <p
            className="text-xs mb-4"
            style={{ color: "var(--rex-text-dim)" }}
          >
            Status breakdown across the full list.
          </p>
          <div className="space-y-2">
            {data.statusBreakdown.map((s) => {
              const colors: Record<string, string> = {
                active: "var(--rex-accent)",
                pending: "var(--rex-warning)",
                unsubscribed: "var(--rex-text-dim)",
                bounced: "var(--rex-danger)",
                complained: "var(--rex-danger)",
              };
              return (
                <div key={s.status} className="flex items-center gap-3">
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{
                      background: colors[s.status] ?? "var(--rex-text-dim)",
                    }}
                  />
                  <span
                    className="text-sm flex-1"
                    style={{ color: "var(--rex-text)" }}
                  >
                    {s.status}
                  </span>
                  <span className="font-mono text-sm text-white">
                    {s.count.toLocaleString()}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rex-card p-5">
          <h3 className="text-sm font-medium text-white mb-1">
            Top bounced addresses
          </h3>
          <p
            className="text-xs mb-4"
            style={{ color: "var(--rex-text-dim)" }}
          >
            Already auto-suppressed. Reviewable from{" "}
            <a
              href="/suppressions"
              className="underline hover:text-[var(--rex-accent)]"
            >
              the suppressions page
            </a>
            .
          </p>
          {data.topBounced.length === 0 ? (
            <p
              className="text-sm"
              style={{ color: "var(--rex-text-dim)" }}
            >
              No bounces yet.
            </p>
          ) : (
            <table className="rex-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th style={{ textAlign: "right" }}>Bounces</th>
                </tr>
              </thead>
              <tbody>
                {data.topBounced.map((b) => (
                  <tr key={b.email}>
                    <td className="font-mono text-xs">{b.email}</td>
                    <td className="text-right font-mono text-xs">
                      {b.count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="rex-card p-5">
          <h3 className="text-sm font-medium text-white mb-1">
            Suppression list
          </h3>
          <p
            className="text-xs mb-4"
            style={{ color: "var(--rex-text-dim)" }}
          >
            Total: {data.suppressions.total.toLocaleString()}. Suppressed
            addresses are filtered out of every send automatically.
          </p>
          <div className="space-y-2">
            {data.suppressions.byReason.map((r) => (
              <div key={r.reason} className="flex items-center gap-3">
                <span
                  className="text-xs uppercase tracking-wider flex-1"
                  style={{ color: "var(--rex-text-muted)" }}
                >
                  {r.reason.replace(/_/g, " ")}
                </span>
                <span className="font-mono text-sm text-white">
                  {r.count.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function ratePct(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}

function RateCard({
  label,
  value,
  status,
  ceiling,
}: {
  label: string;
  value: number;
  status: "good" | "warn" | "danger";
  ceiling: number;
}) {
  const color =
    status === "good"
      ? "var(--rex-accent)"
      : status === "warn"
        ? "var(--rex-warning)"
        : "var(--rex-danger)";
  return (
    <div
      className="rex-card p-4"
      style={{
        borderColor: status === "danger" ? "var(--rex-danger)" : undefined,
      }}
    >
      <div
        className="text-xs uppercase tracking-wider mb-1"
        style={{ color: "var(--rex-text-dim)" }}
      >
        {label}
      </div>
      <div
        className="font-mono text-3xl font-bold"
        style={{ color, lineHeight: 1 }}
      >
        {ratePct(value)}
      </div>
      <div
        className="text-[10px] mt-2 font-mono"
        style={{ color: "var(--rex-text-dim)" }}
      >
        Ceiling: {ratePct(ceiling)}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rex-card p-4">
      <div
        className="text-xs uppercase tracking-wider mb-1"
        style={{ color: "var(--rex-text-dim)" }}
      >
        {label}
      </div>
      <div
        className="font-mono text-3xl font-bold"
        style={{
          color: accent ? "var(--rex-accent-2)" : "var(--rex-text)",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function VolumeChart({ daily }: { daily: DailyRow[] }) {
  // Simple inline-SVG bar chart. Each bar is a stack of delivered (green) +
  // bounced (red). Tooltips on hover via title attribute.
  const maxSent = useMemo(
    () => Math.max(1, ...daily.map((d) => d.sent)),
    [daily],
  );
  if (daily.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--rex-text-dim)" }}>
        No sends in the last 30 days.
      </p>
    );
  }
  const W = 100;
  const H = 100;
  const barW = W / daily.length;

  return (
    <svg
      viewBox={`0 0 ${W} ${H + 12}`}
      preserveAspectRatio="none"
      style={{ width: "100%", height: 140 }}
    >
      {daily.map((d, i) => {
        const sentH = (d.sent / maxSent) * H;
        const bouncedH = (d.bounced / maxSent) * H;
        const x = i * barW + barW * 0.15;
        const w = barW * 0.7;
        return (
          <g key={d.day}>
            <title>
              {d.day}: {d.sent} sent · {d.bounced} bounced ·{" "}
              {d.complained} complained
            </title>
            <rect
              x={x}
              y={H - sentH}
              width={w}
              height={sentH}
              fill="var(--rex-accent)"
              opacity="0.85"
            />
            {bouncedH > 0 && (
              <rect
                x={x}
                y={H - bouncedH}
                width={w}
                height={bouncedH}
                fill="var(--rex-danger)"
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}
