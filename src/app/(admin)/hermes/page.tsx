import { headers } from "next/headers";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  fetchLostCryptoStats,
  fetchValueStats,
} from "@/lib/graph-data";
import { listToolsPublic } from "@/lib/hermes-mcp";

/**
 * /admin/hermes — Rex Deus's Hermes operator dashboard.
 *
 * Two surfaces meet here:
 *   1. The control plane Rex Deus uses to manage Hermes (token presence,
 *      endpoint reference, recent-activity overview).
 *   2. The status mirror of what Hermes can see — site counts, last
 *      cron run, pending submissions — so Rex Deus and Hermes share a
 *      consistent view of state.
 *
 * The actual token rotation happens out-of-band via the Vercel env vars
 * (HERMES_OPERATOR_TOKEN). This page shows whether one is configured but
 * never renders its value.
 */
export const dynamic = "force-dynamic";

const HERMES_ENDPOINTS = [
  {
    method: "POST",
    path: "/api/hermes/mcp",
    summary:
      "MCP server (Streamable HTTP). Speaks JSON-RPC 2.0 — preferred surface for the Nous Research `hermes` agent and any MCP client.",
  },
  {
    method: "GET",
    path: "/api/hermes/healthz",
    summary:
      "REST. Up-check. Returns counts + DB status when authorized; bare ok when not.",
  },
  {
    method: "GET",
    path: "/api/hermes/context",
    summary:
      "REST. Big-picture site snapshot: value counter, lost stats, chains, recent incidents, pending queue.",
  },
  {
    method: "GET",
    path: "/api/hermes/graph",
    summary:
      "REST. Programmatic dump of the address graph. Same query params as /graph.",
  },
  {
    method: "POST",
    path: "/api/hermes/intel",
    summary:
      "REST. Upsert an intel submission (incident/original/tip). Publishes directly as approved.",
  },
  {
    method: "POST",
    path: "/api/hermes/address",
    summary:
      "REST. Upsert an address with category/owner/USD/native fields. Optional intel linkage.",
  },
];

export default async function HermesAdminPage() {
  const tokenConfigured = Boolean(
    (process.env.HERMES_OPERATOR_TOKEN?.trim().length ?? 0) >= 24,
  );

  // Build the canonical MCP URL for the copy-paste config block.
  // Falls back to a placeholder if we can't infer the public origin.
  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "rexintel.com";
  const proto = hdrs.get("x-forwarded-proto") ?? "https";
  const mcpUrl = `${proto}://${host}/api/hermes/mcp`;
  const mcpTools = listToolsPublic();

  const [value, lost, chains, recentApproved, pending] = await Promise.all([
    fetchValueStats(),
    fetchLostCryptoStats(5),
    db.execute(
      sql`SELECT chain, COUNT(*)::int AS n FROM addresses GROUP BY chain ORDER BY n DESC`,
    ),
    db.execute(
      sql`SELECT public_id, payload->>'headline' AS headline, payload->>'kind' AS kind, published_at FROM submissions WHERE type = 'intel' AND status = 'approved' ORDER BY published_at DESC LIMIT 8`,
    ),
    db.execute(
      sql`SELECT id, type, payload->>'headline' AS headline, created_at FROM submissions WHERE status = 'pending' ORDER BY created_at DESC LIMIT 8`,
    ),
  ]);

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-6 max-w-6xl">
      <header className="space-y-2">
        <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-accent)]">
          ⌬ Hermes — Operator Surface
        </div>
        <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-white">
          Hermes Operator
        </h1>
        <p className="text-sm text-[var(--rex-text-muted)] max-w-2xl">
          Programmatic operating surface for the Hermes agent. Hermes calls{" "}
          <code className="text-[var(--rex-accent)]">/api/hermes/*</code> with
          a bearer token to read and write RexIntel state. This page is the
          GUI mirror — control on the left, current visible state on the right.
        </p>
      </header>

      {/* === Token status === */}
      <section className="rex-card p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)]">
              Operator token (HERMES_OPERATOR_TOKEN)
            </div>
            <div className="font-display text-lg font-semibold text-white mt-1">
              {tokenConfigured ? (
                <span className="text-[var(--rex-accent)]">
                  ● Configured
                </span>
              ) : (
                <span className="text-amber-400">
                  ◯ Not configured — Hermes endpoints will reject all calls
                </span>
              )}
            </div>
            <div className="text-xs text-[var(--rex-text-muted)] mt-2 max-w-xl">
              Token is stored only in the Vercel project env (
              <code>HERMES_OPERATOR_TOKEN</code>) — not in the DB and never
              rendered. Rotate by changing the env var; the new value takes
              effect on the next request (no restart needed).
            </div>
          </div>
          <a
            href="https://vercel.com/dashboard"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-mono uppercase tracking-widest px-3 py-2 rounded-sm border border-[var(--rex-border)] text-[var(--rex-text-muted)] hover:text-white hover:border-[var(--rex-accent)] transition-colors"
          >
            Vercel env vars ▸
          </a>
        </div>
      </section>

      {/* === MCP wire-up === */}
      <section className="rex-card p-4 sm:p-5 space-y-4">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-accent)]">
            ⌬ MCP — connect your Hermes agent
          </div>
          <p className="text-xs text-[var(--rex-text-muted)] mt-2 max-w-2xl">
            RexIntel exposes a Model Context Protocol server at the URL below.
            Add it to your Hermes config and the {mcpTools.length} tools become
            callable from any chat — CLI, Telegram, or Discord.
          </p>
        </div>

        <div>
          <div className="text-[9px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)] mb-1">
            MCP endpoint
          </div>
          <code className="block text-xs font-mono text-white bg-black/40 border border-[var(--rex-border-subtle)] rounded-sm px-3 py-2 break-all">
            {mcpUrl}
          </code>
        </div>

        <div>
          <div className="text-[9px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)] mb-1">
            Add via CLI
          </div>
          <pre className="text-[11px] font-mono text-white bg-black/40 border border-[var(--rex-border-subtle)] rounded-sm px-3 py-2 overflow-x-auto">
{`hermes mcp add rexintel \\
  --url ${mcpUrl} \\
  --header "Authorization: Bearer $HERMES_OPERATOR_TOKEN"`}
          </pre>
        </div>

        <div>
          <div className="text-[9px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)] mb-1">
            Or paste into ~/.hermes/config.yaml
          </div>
          <pre className="text-[11px] font-mono text-white bg-black/40 border border-[var(--rex-border-subtle)] rounded-sm px-3 py-2 overflow-x-auto">
{`mcp_servers:
  rexintel:
    url: "${mcpUrl}"
    headers:
      Authorization: "Bearer \${HERMES_OPERATOR_TOKEN}"`}
          </pre>
          <p className="text-[10px] text-[var(--rex-text-dim)] mt-2">
            Then run <code className="text-white">/reload-mcp</code> in your
            Hermes session. The token must be set as an env var in the shell
            that runs Hermes (it never leaves your machine — RexIntel only
            sees the hashed bearer presented in the Authorization header).
          </p>
        </div>

        <div>
          <div className="text-[9px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)] mb-1">
            MCP tools registered
          </div>
          <ul className="text-xs space-y-1">
            {mcpTools.map((t) => (
              <li key={t.name} className="flex flex-col">
                <code className="text-[var(--rex-accent)] font-mono">
                  {t.name}
                </code>
                <span className="text-[var(--rex-text-muted)] pl-3">
                  {t.description}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {!tokenConfigured ? (
          <div className="text-[11px] font-mono text-amber-400 border border-amber-400/40 rounded-sm px-3 py-2 bg-amber-400/5">
            ⚠ Set HERMES_OPERATOR_TOKEN in Vercel env before connecting Hermes.
            Until then this endpoint returns 401 on every request.
          </div>
        ) : null}
      </section>

      {/* === State mirror — what Hermes sees === */}
      <section className="rex-card p-4 sm:p-5">
        <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-accent)] mb-3">
          State mirror — what Hermes can see right now
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          <Stat label="Priced value" value={formatUsd(value.totalUsd)} sub={`${value.walletCount} addrs`} />
          <Stat label="Lost crypto" value={formatUsd(lost.totalUsd)} sub={`${lost.walletCount} wallets`} />
          <Stat label="Addresses" value={String(value.addressCount)} sub={`${chains.rows.length} chains`} />
          <Stat label="Pending queue" value={String(pending.rows.length)} sub="awaiting review" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4 border-t border-[var(--rex-border-subtle)] pt-4">
          <div>
            <div className="text-[9px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)] mb-2">
              Native amounts
            </div>
            {value.byToken.length > 0 ? (
              <ul className="space-y-1 text-xs font-mono">
                {value.byToken.map((t) => (
                  <li key={t.symbol} className="flex justify-between">
                    <span className="text-[var(--rex-accent)]">{t.symbol}</span>
                    <span className="text-white">
                      {t.totalAmount.toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}{" "}
                      {t.symbol}
                    </span>
                    <span className="text-[var(--rex-text-dim)]">
                      {formatUsd(t.totalUsd)} · {t.walletCount}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-xs text-[var(--rex-text-dim)]">
                No priced native amounts yet.
              </div>
            )}
          </div>

          <div>
            <div className="text-[9px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)] mb-2">
              Chain coverage
            </div>
            <ul className="space-y-1 text-xs font-mono max-h-40 overflow-auto">
              {chains.rows.map((r) => {
                const c = r as { chain: string; n: number };
                return (
                  <li key={c.chain} className="flex justify-between">
                    <span className="text-white">{c.chain}</span>
                    <span className="text-[var(--rex-text-dim)]">{c.n}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </section>

      {/* === Endpoint reference === */}
      <section className="rex-card p-4 sm:p-5">
        <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-accent)] mb-3">
          Endpoint reference
        </div>
        <div className="text-xs text-[var(--rex-text-muted)] mb-3">
          All routes require{" "}
          <code className="text-white">
            Authorization: Bearer $HERMES_OPERATOR_TOKEN
          </code>{" "}
          (except <code>/healthz</code>, which is callable without auth but
          returns reduced fields).
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[9px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)] border-b border-[var(--rex-border-subtle)]">
              <th className="py-2 pr-4">Method</th>
              <th className="py-2 pr-4">Path</th>
              <th className="py-2">Purpose</th>
            </tr>
          </thead>
          <tbody>
            {HERMES_ENDPOINTS.map((e) => (
              <tr
                key={`${e.method} ${e.path}`}
                className="border-b border-[var(--rex-border-subtle)]"
              >
                <td className="py-2 pr-4 font-mono text-[var(--rex-accent)]">
                  {e.method}
                </td>
                <td className="py-2 pr-4 font-mono text-white">{e.path}</td>
                <td className="py-2 text-[var(--rex-text-muted)]">
                  {e.summary}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* === Recent activity === */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rex-card p-4 sm:p-5">
          <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-accent)] mb-3">
            Last 8 approved intel
          </div>
          <ul className="space-y-2 text-xs">
            {recentApproved.rows.map((r) => {
              const row = r as {
                public_id: string;
                headline: string;
                kind: string;
                published_at: string;
              };
              return (
                <li key={row.public_id} className="flex flex-col">
                  <a
                    href={`/intel/${row.public_id}`}
                    className="text-white hover:text-[var(--rex-accent)] truncate"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {row.headline}
                  </a>
                  <span className="font-mono text-[10px] text-[var(--rex-text-dim)]">
                    {row.kind} ·{" "}
                    {row.published_at
                      ? new Date(row.published_at).toUTCString()
                      : "—"}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="rex-card p-4 sm:p-5">
          <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-accent)] mb-3">
            Pending queue
          </div>
          {pending.rows.length === 0 ? (
            <div className="text-xs text-[var(--rex-text-dim)]">
              Empty. Hermes has nothing waiting for curator review.
            </div>
          ) : (
            <ul className="space-y-2 text-xs">
              {pending.rows.map((r) => {
                const row = r as {
                  id: string;
                  type: string;
                  headline: string | null;
                  created_at: string;
                };
                return (
                  <li key={row.id} className="flex flex-col">
                    <span className="text-white truncate">
                      {row.headline ?? `[${row.type}] (no headline)`}
                    </span>
                    <span className="font-mono text-[10px] text-[var(--rex-text-dim)]">
                      {row.type} ·{" "}
                      {row.created_at
                        ? new Date(row.created_at).toUTCString()
                        : "—"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div>
      <div className="text-[9px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)]">
        {label}
      </div>
      <div className="font-display text-lg font-semibold text-white mt-1">
        {value}
      </div>
      {sub ? (
        <div className="text-[10px] font-mono text-[var(--rex-text-dim)] mt-0.5">
          {sub}
        </div>
      ) : null}
    </div>
  );
}

function formatUsd(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}
