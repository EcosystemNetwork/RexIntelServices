"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

interface FunnelStep {
  recipients: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  failed: number;
  unsubscribed: number;
}

interface Rates {
  deliveryRate: number;
  openRate: number;
  clickRate: number;
  clickToOpenRate: number;
  bounceRate: number;
  complaintRate: number;
  unsubRate: number;
}

interface VariantStats {
  subject: string;
  sent: number;
  opened: number;
  clicked: number;
  openRate: number;
  clickRate: number;
}

interface AB {
  a: VariantStats;
  b: VariantStats;
  winner: { subject: string | null; metric: string | null; pickedAt: string | null };
}

interface RecipientRow {
  email: string;
  firstName: string | null;
  lastName: string | null;
  subscriberStatus: string;
  sendStatus: string;
  sentAt: string | null;
  deliveredAt: string | null;
  openedAt: string | null;
  openCount: number | null;
  clickedAt: string | null;
  clickCount: number | null;
  bouncedAt: string | null;
  abVariant: string | null;
}

interface Analytics {
  campaign: {
    id: string;
    name: string;
    subject: string;
    subjectB: string | null;
    fromName: string;
    fromEmail: string;
    previewText: string | null;
    status: string;
    scheduledFor: string | null;
    sentAt: string | null;
    createdAt: string;
    recipientCount: number;
    counters: {
      sent: number;
      delivered: number;
      opened: number;
      clicked: number;
      bounced: number;
      complained: number;
      unsubscribed: number;
    };
  };
  funnel: FunnelStep;
  rates: Rates;
  ab: AB | null;
  topLinks: Array<{ url: string; clicks: number | null }>;
  timeline: {
    opens: Array<{ bucket: string; count: number }>;
    clicks: Array<{ bucket: string; count: number }>;
  };
  recipients: {
    rows: RecipientRow[];
    total: number;
    page: number;
    pageSize: number;
    filter: string;
    search: string;
  };
}

const FILTERS = ["all", "opened", "clicked", "bounced", "unopened", "unsubscribed"];

export default function CampaignAnalyticsPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [searchDraft, setSearchDraft] = useState("");

  async function load() {
    setLoading(true);
    const q = new URLSearchParams({
      recipientFilter: filter,
      recipientSearch: search,
      page: String(page),
      pageSize: "50",
    });
    const res = await fetch(`/api/campaigns/${id}/analytics?${q}`);
    if (!res.ok) {
      setLoading(false);
      setData(null);
      return;
    }
    const d = (await res.json()) as Analytics;
    setData(d);
    setLoading(false);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, filter, search, page]);

  // Auto-refresh while sending so the funnel ticks live.
  useEffect(() => {
    if (data?.campaign.status !== "sending") return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.campaign.status]);

  if (loading && !data) {
    return (
      <div className="p-10" style={{ color: "var(--rex-text-dim)" }}>
        Loading analytics…
      </div>
    );
  }
  if (!data) {
    return (
      <div className="p-10">
        <p style={{ color: "var(--rex-danger)" }}>Campaign not found.</p>
        <Link
          href="/campaigns"
          className="text-sm hover:text-[var(--rex-accent)]"
          style={{ color: "var(--rex-text-dim)" }}
        >
          ← Back to campaigns
        </Link>
      </div>
    );
  }

  const { campaign, funnel, rates, ab, topLinks, timeline, recipients } = data;
  const lastPage = Math.max(1, Math.ceil(recipients.total / recipients.pageSize));

  return (
    <div className="p-10 max-w-7xl">
      <header className="mb-8">
        <div className="flex items-baseline justify-between gap-4 mb-2">
          <div>
            <p
              className="text-xs uppercase tracking-widest mb-1"
              style={{ color: "var(--rex-text-dim)" }}
            >
              <Link href="/campaigns" className="hover:text-[var(--rex-accent)]">
                ← Campaigns
              </Link>{" "}
              · Performance
            </p>
            <h1 className="font-display text-3xl font-medium text-white">
              {campaign.name}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <span className={`pill pill-${campaign.status}`}>
              {campaign.status}
            </span>
            {(campaign.status === "draft" || campaign.status === "scheduled") && (
              <Link
                href={`/campaigns/new?id=${campaign.id}`}
                className="rex-btn text-sm"
              >
                Edit
              </Link>
            )}
          </div>
        </div>
        <p className="text-sm" style={{ color: "var(--rex-text-muted)" }}>
          <span className="font-mono">{campaign.subject}</span>
          {campaign.subjectB && (
            <>
              {" "}·{" "}
              <span className="font-mono">{campaign.subjectB}</span>
              <span
                className="text-[10px] ml-1 uppercase tracking-widest"
                style={{ color: "var(--rex-accent-2)" }}
              >
                A/B
              </span>
            </>
          )}
        </p>
        <p
          className="text-xs mt-1 font-mono"
          style={{ color: "var(--rex-text-dim)" }}
        >
          {campaign.fromName} &lt;{campaign.fromEmail}&gt;
          {campaign.sentAt && (
            <> · sent {new Date(campaign.sentAt).toLocaleString()}</>
          )}
          {!campaign.sentAt && campaign.scheduledFor && (
            <> · scheduled {new Date(campaign.scheduledFor).toLocaleString()}</>
          )}
          {!campaign.sentAt && !campaign.scheduledFor && (
            <> · created {new Date(campaign.createdAt).toLocaleString()}</>
          )}
        </p>
      </header>

      <Funnel funnel={funnel} rates={rates} />

      {ab && (
        <section className="mb-10">
          <p
            className="text-xs uppercase tracking-widest mb-3"
            style={{ color: "var(--rex-text-dim)" }}
          >
            ▸ A/B subject test
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <VariantCard label="A" v={ab.a} winner={ab.winner.subject === ab.a.subject} />
            <VariantCard label="B" v={ab.b} winner={ab.winner.subject === ab.b.subject} />
          </div>
          {ab.winner.subject && (
            <p
              className="text-xs mt-3 font-mono"
              style={{ color: "var(--rex-text-dim)" }}
            >
              Winner picked{" "}
              {ab.winner.pickedAt
                ? new Date(ab.winner.pickedAt).toLocaleString()
                : ""}{" "}
              on <span className="text-white">{ab.winner.metric}</span> — sent
              remaining list with{" "}
              <span className="text-white font-mono">“{ab.winner.subject}”</span>
            </p>
          )}
        </section>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
        <Card title="Open rate" big={pct(rates.openRate)} sub={`${funnel.opened.toLocaleString()} of ${funnel.delivered.toLocaleString()} delivered`} />
        <Card title="Click rate" big={pct(rates.clickRate)} sub={`${funnel.clicked.toLocaleString()} clicks`} accent />
        <Card title="Click-to-open" big={pct(rates.clickToOpenRate)} sub="of openers" />
        <Card title="Bounce rate" big={pct(rates.bounceRate)} sub={`${funnel.bounced.toLocaleString()} bounced`} status={rates.bounceRate >= 0.004 ? "danger" : rates.bounceRate >= 0.002 ? "warn" : "good"} />
        <Card title="Complaint rate" big={pct(rates.complaintRate)} sub={`${funnel.complained.toLocaleString()} complaints`} status={rates.complaintRate >= 0.001 ? "danger" : rates.complaintRate >= 0.0005 ? "warn" : "good"} />
        <Card title="Unsub rate" big={pct(rates.unsubRate)} sub={`${funnel.unsubscribed.toLocaleString()} unsubs`} />
      </div>

      <section className="mb-10">
        <p
          className="text-xs uppercase tracking-widest mb-3"
          style={{ color: "var(--rex-text-dim)" }}
        >
          ▸ Engagement over time
        </p>
        <div className="rex-card p-5">
          <Timeline opens={timeline.opens} clicks={timeline.clicks} />
        </div>
      </section>

      <section className="mb-10">
        <p
          className="text-xs uppercase tracking-widest mb-3"
          style={{ color: "var(--rex-text-dim)" }}
        >
          ▸ Top clicked links
        </p>
        <div className="rex-card p-5">
          {topLinks.length === 0 ? (
            <p
              className="text-sm"
              style={{ color: "var(--rex-text-dim)" }}
            >
              No tracked links clicked yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {topLinks.map((l) => (
                <li
                  key={l.url}
                  className="flex items-baseline justify-between gap-4 text-sm"
                >
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono truncate text-white hover:text-[var(--rex-accent)] flex-1 min-w-0"
                  >
                    {l.url}
                  </a>
                  <span className="font-mono text-white whitespace-nowrap">
                    {(l.clicks ?? 0).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-3 gap-4 flex-wrap">
          <p
            className="text-xs uppercase tracking-widest"
            style={{ color: "var(--rex-text-dim)" }}
          >
            ▸ Recipients ({recipients.total.toLocaleString()})
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => {
                  setFilter(f);
                  setPage(1);
                }}
                className="text-xs px-3 py-1 rounded-full transition-colors"
                style={
                  filter === f
                    ? {
                        background: "var(--rex-accent)",
                        color: "var(--rex-bg)",
                        fontWeight: 600,
                      }
                    : {
                        background: "var(--rex-surface-2)",
                        color: "var(--rex-text-muted)",
                      }
                }
              >
                {f}
              </button>
            ))}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setSearch(searchDraft.trim());
                setPage(1);
              }}
              className="flex items-center gap-1"
            >
              <input
                placeholder="email…"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                className="text-xs px-2 py-1 rounded font-mono"
                style={{
                  background: "var(--rex-surface-2)",
                  color: "var(--rex-text)",
                  border: "1px solid var(--rex-border-subtle)",
                }}
              />
            </form>
          </div>
        </div>
        <div className="rex-card overflow-x-auto">
          <table className="rex-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Status</th>
                <th>Variant</th>
                <th>Opened</th>
                <th>Clicked</th>
                <th>Bounced</th>
              </tr>
            </thead>
            <tbody>
              {recipients.rows.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ color: "var(--rex-text-dim)" }}>
                    No matching recipients.
                  </td>
                </tr>
              ) : (
                recipients.rows.map((r) => (
                  <tr key={r.email}>
                    <td>
                      <div className="font-mono text-xs text-white">
                        {r.email}
                      </div>
                      {(r.firstName || r.lastName) && (
                        <div
                          className="text-[11px]"
                          style={{ color: "var(--rex-text-dim)" }}
                        >
                          {[r.firstName, r.lastName].filter(Boolean).join(" ")}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`pill pill-${r.sendStatus}`}>
                        {r.sendStatus}
                      </span>
                      {r.subscriberStatus !== "active" && (
                        <span
                          className="ml-1 text-[10px] uppercase tracking-widest font-mono"
                          style={{ color: "var(--rex-warning)" }}
                        >
                          {r.subscriberStatus}
                        </span>
                      )}
                    </td>
                    <td
                      className="font-mono text-xs"
                      style={{ color: "var(--rex-text-muted)" }}
                    >
                      {r.abVariant ? r.abVariant.toUpperCase() : "—"}
                    </td>
                    <td className="font-mono text-xs">
                      {r.openedAt ? (
                        <>
                          <span style={{ color: "var(--rex-accent)" }}>
                            {(r.openCount ?? 1).toLocaleString()}×
                          </span>{" "}
                          <span style={{ color: "var(--rex-text-dim)" }}>
                            {fmtDate(r.openedAt)}
                          </span>
                        </>
                      ) : (
                        <span style={{ color: "var(--rex-text-dim)" }}>—</span>
                      )}
                    </td>
                    <td className="font-mono text-xs">
                      {r.clickedAt ? (
                        <>
                          <span style={{ color: "var(--rex-accent-2)" }}>
                            {(r.clickCount ?? 1).toLocaleString()}×
                          </span>{" "}
                          <span style={{ color: "var(--rex-text-dim)" }}>
                            {fmtDate(r.clickedAt)}
                          </span>
                        </>
                      ) : (
                        <span style={{ color: "var(--rex-text-dim)" }}>—</span>
                      )}
                    </td>
                    <td
                      className="font-mono text-xs"
                      style={{ color: r.bouncedAt ? "var(--rex-danger)" : "var(--rex-text-dim)" }}
                    >
                      {r.bouncedAt ? fmtDate(r.bouncedAt) : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {lastPage > 1 && (
          <div className="flex items-center justify-between mt-3 text-xs">
            <span style={{ color: "var(--rex-text-dim)" }} className="font-mono">
              Page {recipients.page} of {lastPage}
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="px-3 py-1 rounded text-xs"
                style={{
                  background: "var(--rex-surface-2)",
                  color: page <= 1 ? "var(--rex-text-dim)" : "var(--rex-text)",
                  opacity: page <= 1 ? 0.4 : 1,
                }}
              >
                Prev
              </button>
              <button
                disabled={page >= lastPage}
                onClick={() => setPage(page + 1)}
                className="px-3 py-1 rounded text-xs"
                style={{
                  background: "var(--rex-surface-2)",
                  color:
                    page >= lastPage ? "var(--rex-text-dim)" : "var(--rex-text)",
                  opacity: page >= lastPage ? 0.4 : 1,
                }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Card({
  title,
  big,
  sub,
  accent,
  status,
}: {
  title: string;
  big: string;
  sub?: string;
  accent?: boolean;
  status?: "good" | "warn" | "danger";
}) {
  const color =
    status === "danger"
      ? "var(--rex-danger)"
      : status === "warn"
        ? "var(--rex-warning)"
        : accent
          ? "var(--rex-accent-2)"
          : "var(--rex-accent)";
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
        {title}
      </div>
      <div
        className="font-mono text-3xl font-bold"
        style={{ color, lineHeight: 1 }}
      >
        {big}
      </div>
      {sub && (
        <div
          className="text-[11px] mt-2 font-mono"
          style={{ color: "var(--rex-text-dim)" }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

function Funnel({ funnel, rates }: { funnel: FunnelStep; rates: Rates }) {
  // Stage widths anchored to recipients. A flat horizontal funnel works
  // better than a tapered SVG for a 4-6 stage analytics view because
  // every stage gets a visible bar even at 0.
  const steps: Array<{ label: string; value: number; color: string }> = [
    { label: "Recipients", value: funnel.recipients, color: "var(--rex-text-muted)" },
    { label: "Sent", value: funnel.sent, color: "var(--rex-text-muted)" },
    { label: "Delivered", value: funnel.delivered, color: "var(--rex-text)" },
    { label: "Opened", value: funnel.opened, color: "var(--rex-accent)" },
    { label: "Clicked", value: funnel.clicked, color: "var(--rex-accent-2)" },
  ];
  const denom = Math.max(1, funnel.recipients);
  return (
    <section className="mb-10">
      <p
        className="text-xs uppercase tracking-widest mb-3"
        style={{ color: "var(--rex-text-dim)" }}
      >
        ▸ Funnel
      </p>
      <div className="rex-card p-5 space-y-3">
        {steps.map((s) => {
          const width = (s.value / denom) * 100;
          return (
            <div key={s.label} className="flex items-center gap-3">
              <span
                className="text-xs w-24 flex-shrink-0"
                style={{ color: "var(--rex-text-muted)" }}
              >
                {s.label}
              </span>
              <div
                className="flex-1 h-5 rounded overflow-hidden"
                style={{ background: "var(--rex-surface-2)" }}
              >
                <div
                  className="h-full transition-all duration-500"
                  style={{ width: `${width}%`, background: s.color }}
                />
              </div>
              <span className="font-mono text-sm text-white w-24 text-right whitespace-nowrap">
                {s.value.toLocaleString()}
                <span
                  className="ml-1 text-[10px]"
                  style={{ color: "var(--rex-text-dim)" }}
                >
                  ({((s.value / denom) * 100).toFixed(0)}%)
                </span>
              </span>
            </div>
          );
        })}
        {(funnel.bounced > 0 || funnel.complained > 0 || funnel.unsubscribed > 0) && (
          <div
            className="flex items-center gap-4 pt-3 mt-2 text-xs border-t font-mono"
            style={{ borderColor: "var(--rex-border-subtle)" }}
          >
            <span style={{ color: "var(--rex-text-dim)" }}>Negative signals:</span>
            {funnel.bounced > 0 && (
              <span style={{ color: "var(--rex-danger)" }}>
                {funnel.bounced.toLocaleString()} bounced
              </span>
            )}
            {funnel.complained > 0 && (
              <span style={{ color: "var(--rex-danger)" }}>
                {funnel.complained.toLocaleString()} complaints
              </span>
            )}
            {funnel.unsubscribed > 0 && (
              <span style={{ color: "var(--rex-warning)" }}>
                {funnel.unsubscribed.toLocaleString()} unsubs
              </span>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function VariantCard({
  label,
  v,
  winner,
}: {
  label: string;
  v: VariantStats;
  winner: boolean;
}) {
  return (
    <div
      className="rex-card p-5"
      style={
        winner
          ? { borderColor: "var(--rex-accent)" }
          : undefined
      }
    >
      <div className="flex items-baseline gap-2 mb-2">
        <span
          className="text-xs uppercase tracking-widest font-mono"
          style={{ color: winner ? "var(--rex-accent)" : "var(--rex-text-dim)" }}
        >
          Variant {label} {winner ? "· winner" : ""}
        </span>
      </div>
      <div className="font-mono text-sm text-white mb-3 truncate">
        {v.subject}
      </div>
      <div className="grid grid-cols-3 gap-3 text-xs font-mono">
        <div>
          <div style={{ color: "var(--rex-text-dim)" }}>Sent</div>
          <div className="text-white text-base">{v.sent.toLocaleString()}</div>
        </div>
        <div>
          <div style={{ color: "var(--rex-text-dim)" }}>Open</div>
          <div className="text-white text-base">
            {(v.openRate * 100).toFixed(1)}%
          </div>
          <div style={{ color: "var(--rex-text-dim)" }}>
            {v.opened.toLocaleString()}
          </div>
        </div>
        <div>
          <div style={{ color: "var(--rex-text-dim)" }}>Click</div>
          <div className="text-white text-base">
            {(v.clickRate * 100).toFixed(1)}%
          </div>
          <div style={{ color: "var(--rex-text-dim)" }}>
            {v.clicked.toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  );
}

function Timeline({
  opens,
  clicks,
}: {
  opens: Array<{ bucket: string; count: number }>;
  clicks: Array<{ bucket: string; count: number }>;
}) {
  // Merge both series into one sorted bucket index so the SVG aligns.
  const { buckets, openSeries, clickSeries, max } = useMemo(() => {
    const all = new Set<string>([
      ...opens.map((o) => o.bucket),
      ...clicks.map((c) => c.bucket),
    ]);
    const sorted = Array.from(all).sort();
    const oMap = new Map(opens.map((o) => [o.bucket, o.count]));
    const cMap = new Map(clicks.map((c) => [c.bucket, c.count]));
    const oSeries = sorted.map((b) => oMap.get(b) ?? 0);
    const cSeries = sorted.map((b) => cMap.get(b) ?? 0);
    const maxVal = Math.max(1, ...oSeries, ...cSeries);
    return {
      buckets: sorted,
      openSeries: oSeries,
      clickSeries: cSeries,
      max: maxVal,
    };
  }, [opens, clicks]);

  if (buckets.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--rex-text-dim)" }}>
        No opens or clicks recorded yet.
      </p>
    );
  }
  const W = 100;
  const H = 60;
  const barW = W / buckets.length;
  return (
    <>
      <svg
        viewBox={`0 0 ${W} ${H + 12}`}
        preserveAspectRatio="none"
        style={{ width: "100%", height: 160 }}
      >
        {buckets.map((b, i) => {
          const oH = (openSeries[i] / max) * H;
          const cH = (clickSeries[i] / max) * H;
          const x = i * barW + barW * 0.1;
          const w = barW * 0.4;
          return (
            <g key={b}>
              <title>
                {new Date(b).toLocaleString()}: {openSeries[i]} opens ·{" "}
                {clickSeries[i]} clicks
              </title>
              <rect
                x={x}
                y={H - oH}
                width={w}
                height={oH}
                fill="var(--rex-accent)"
                opacity="0.85"
              />
              <rect
                x={x + w + barW * 0.05}
                y={H - cH}
                width={w}
                height={cH}
                fill="var(--rex-accent-2)"
                opacity="0.85"
              />
            </g>
          );
        })}
      </svg>
      <div
        className="flex items-center justify-between mt-2 text-[10px] font-mono"
        style={{ color: "var(--rex-text-dim)" }}
      >
        <span>{new Date(buckets[0]).toLocaleString()}</span>
        <span>
          <span style={{ color: "var(--rex-accent)" }}>■</span> opens ·{" "}
          <span style={{ color: "var(--rex-accent-2)" }}>■</span> clicks
        </span>
        <span>{new Date(buckets[buckets.length - 1]).toLocaleString()}</span>
      </div>
    </>
  );
}
