"use client";

import { useEffect, useMemo, useState } from "react";
import { explorerUrl } from "@/lib/chains";

interface Contributor {
  id: string;
  email: string | null;
  slug: string;
  displayHandle: string | null;
  walletAddress: string | null;
  walletChain: string | null;
  clearanceTier: "open" | "contributor" | "trusted" | "inner_circle";
  points: number;
  loginCount: number;
  lastLoginAt: string | null;
  createdAt: string;
  submissionCount: number;
  lastContributionAt: string | null;
}

interface Stats {
  total: number;
  everLoggedIn: number;
  last7dSignups: number;
  last7dActive: number;
}

const TIERS = ["open", "contributor", "trusted", "inner_circle"] as const;
type Tier = (typeof TIERS)[number];

const TIER_LABELS: Record<Tier, string> = {
  open: "Open",
  contributor: "Contributor",
  trusted: "Trusted",
  inner_circle: "Inner circle",
};

const SORTS = [
  { value: "recent_signup", label: "Newest signups" },
  { value: "last_login", label: "Most recent login" },
  { value: "logins", label: "Most logins" },
  { value: "points", label: "Most points" },
] as const;

export default function UsersPage() {
  const [rows, setRows] = useState<Contributor[]>([]);
  const [stats, setStats] = useState<Stats>({
    total: 0,
    everLoggedIn: 0,
    last7dSignups: 0,
    last7dActive: 0,
  });
  const [q, setQ] = useState("");
  const [tierFilter, setTierFilter] = useState<Tier | "">("");
  const [sort, setSort] = useState<(typeof SORTS)[number]["value"]>(
    "recent_signup",
  );
  const [loading, setLoading] = useState(true);

  const queryString = useMemo(() => {
    const sp = new URLSearchParams();
    sp.set("limit", "200");
    sp.set("sort", sort);
    if (q) sp.set("q", q);
    if (tierFilter) sp.set("tier", tierFilter);
    return sp.toString();
  }, [q, tierFilter, sort]);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      const res = await fetch(`/api/admin/contributors?${queryString}`);
      const data = await res.json();
      if (cancelled) return;
      setRows(data.contributors ?? []);
      setStats(
        data.stats ?? {
          total: 0,
          everLoggedIn: 0,
          last7dSignups: 0,
          last7dActive: 0,
        },
      );
      setLoading(false);
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [queryString]);

  return (
    <div className="p-10 max-w-7xl">
      <header className="mb-8">
        <p
          className="text-xs uppercase tracking-widest mb-1"
          style={{ color: "var(--rex-text-dim)" }}
        >
          People
        </p>
        <h1 className="font-display text-4xl font-medium text-white">
          Contributors
        </h1>
        <p
          className="text-sm mt-1"
          style={{ color: "var(--rex-text-muted)" }}
        >
          Email-onboarded Magic Link wallet signups. Every sign-in mints
          a fresh login event.
        </p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="rex-stat accent">
          <div className="rex-stat-label">Total signups</div>
          <div className="rex-stat-value">
            {stats.total.toLocaleString()}
          </div>
        </div>
        <div className="rex-stat">
          <div className="rex-stat-label">Ever logged in</div>
          <div className="rex-stat-value">
            {stats.everLoggedIn.toLocaleString()}
          </div>
        </div>
        <div className="rex-stat">
          <div className="rex-stat-label">New (7d)</div>
          <div className="rex-stat-value">
            {stats.last7dSignups.toLocaleString()}
          </div>
        </div>
        <div className="rex-stat">
          <div className="rex-stat-label">Active (7d)</div>
          <div className="rex-stat-value">
            {stats.last7dActive.toLocaleString()}
          </div>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <input
          placeholder="Search email, wallet, handle, slug…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="rex-input flex-1 min-w-[280px] max-w-md"
        />
        <select
          value={tierFilter}
          onChange={(e) => setTierFilter(e.target.value as Tier | "")}
          className="rex-input max-w-[200px]"
          aria-label="Filter by clearance tier"
        >
          <option value="">All tiers</option>
          {TIERS.map((t) => (
            <option key={t} value={t}>
              {TIER_LABELS[t]}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) =>
            setSort(e.target.value as (typeof SORTS)[number]["value"])
          }
          className="rex-input max-w-[220px]"
          aria-label="Sort order"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className="rex-card">
        <table className="rex-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Wallet</th>
              <th>Tier</th>
              <th style={{ textAlign: "right" }}>Points</th>
              <th style={{ textAlign: "right" }}>Logins</th>
              <th>Last login</th>
              <th>Submissions</th>
              <th>Signed up</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="text-center py-12"
                  style={{ color: "var(--rex-text-dim)" }}
                >
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="text-center py-12"
                  style={{ color: "var(--rex-text-dim)" }}
                >
                  No contributors yet. They appear here on the first email-to-
                  wallet sign-in.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <a
                      href={`/contributors/${r.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-xs text-white hover:text-[var(--rex-accent)]"
                    >
                      {r.email ?? (
                        <span style={{ color: "var(--rex-text-dim)" }}>
                          anon
                        </span>
                      )}
                    </a>
                    {r.displayHandle && (
                      <div
                        className="text-xs mt-0.5"
                        style={{ color: "var(--rex-text-dim)" }}
                      >
                        {r.displayHandle}
                      </div>
                    )}
                  </td>
                  <td
                    className="font-mono text-xs"
                    style={{ color: "var(--rex-text-muted)" }}
                  >
                    {r.walletAddress ? (
                      (() => {
                        const href = explorerUrl(
                          r.walletChain ?? "ethereum",
                          r.walletAddress,
                        );
                        const inner = (
                          <>
                            {r.walletAddress.slice(0, 6)}…
                            {r.walletAddress.slice(-4)}
                            {r.walletChain && r.walletChain !== "ethereum" && (
                              <span
                                className="ml-1.5 text-[10px] uppercase"
                                style={{ color: "var(--rex-text-dim)" }}
                              >
                                {r.walletChain}
                              </span>
                            )}
                          </>
                        );
                        return href ? (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={r.walletAddress}
                            className="text-[var(--rex-accent)] underline decoration-dotted underline-offset-2 hover:decoration-solid"
                          >
                            {inner}
                          </a>
                        ) : (
                          <span title={r.walletAddress}>{inner}</span>
                        );
                      })()
                    ) : (
                      <span style={{ color: "var(--rex-text-dim)" }}>
                        no wallet
                      </span>
                    )}
                  </td>
                  <td>
                    <span
                      className="text-[11px] font-mono px-2 py-0.5 rounded-full border whitespace-nowrap"
                      style={{
                        borderColor: "var(--rex-border)",
                        color:
                          r.clearanceTier === "open"
                            ? "var(--rex-text-dim)"
                            : "var(--rex-accent)",
                        background:
                          r.clearanceTier === "open"
                            ? "transparent"
                            : "rgba(95,185,31,0.06)",
                      }}
                    >
                      {TIER_LABELS[r.clearanceTier]}
                    </span>
                  </td>
                  <td
                    className="text-right font-mono text-xs"
                    style={{ color: "var(--rex-text-muted)" }}
                  >
                    {r.points.toLocaleString()}
                  </td>
                  <td
                    className="text-right font-mono text-xs"
                    style={{
                      color:
                        r.loginCount > 0
                          ? "var(--rex-text)"
                          : "var(--rex-text-dim)",
                    }}
                  >
                    {r.loginCount.toLocaleString()}
                  </td>
                  <td
                    className="text-xs"
                    style={{ color: "var(--rex-text-dim)" }}
                  >
                    {r.lastLoginAt ? formatRelative(r.lastLoginAt) : "never"}
                  </td>
                  <td
                    className="text-xs"
                    style={{ color: "var(--rex-text-dim)" }}
                  >
                    {r.submissionCount > 0 ? (
                      <a
                        href={`/submissions?q=${encodeURIComponent(
                          r.email ?? r.slug,
                        )}`}
                        className="text-white hover:text-[var(--rex-accent)] font-mono"
                      >
                        {r.submissionCount}
                      </a>
                    ) : (
                      "0"
                    )}
                  </td>
                  <td
                    className="text-xs"
                    style={{ color: "var(--rex-text-dim)" }}
                  >
                    {new Date(r.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
