"use client";

import { useEffect, useState } from "react";

type Counters = {
  drafts?: number | string;
  funded?: number | string;
  open?: number | string;
  adjudicating?: number | string;
  paid?: number | string;
  refunded?: number | string;
  expired?: number | string;
  live_escrow_usdc?: number | string;
};

type DraftRow = {
  publicId: string;
  kind: string;
  victimEmail: string;
  flatAmountUsdc: string | null;
  recoveryPercentBps: number | null;
  createdAt: string;
  circleWalletAddress: string | null;
};

type AwaitingRow = {
  publicId: string;
  kind: string;
  victimEmail: string;
  escrowedAmountUsdc: string;
  createdAt: string;
};

type StuckPayoutRow = {
  id: string;
  bountyId: string;
  amountUsdc: string;
  payeeKind: string;
  createdAt: string;
  failureReason: string | null;
};

type FailedPayoutRow = StuckPayoutRow;

type ApiResponse = {
  ok: true;
  counters: Counters;
  unfundedDrafts: DraftRow[];
  awaitingVerification: AwaitingRow[];
  stuckPayouts: StuckPayoutRow[];
  failedPayouts: FailedPayoutRow[];
};

export function BountyOverview() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setErr(null);
      try {
        const res = await fetch("/api/admin/bounties");
        const body = (await res.json()) as
          | ApiResponse
          | { ok: false; error: string };
        if (!cancelled) {
          if (!res.ok || !body.ok) {
            setErr("error" in body ? body.error : "load_failed");
          } else {
            setData(body);
          }
        }
      } catch (e) {
        if (!cancelled)
          setErr(e instanceof Error ? e.message : "network_error");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (err) {
    return (
      <section className="rex-card p-4 border border-[var(--rex-warning)]/40 text-[12px] font-mono text-[var(--rex-warning)]">
        ⚠ {err}
      </section>
    );
  }
  if (!data) {
    return (
      <section className="rex-card p-4 text-sm text-[var(--rex-text-muted)]">
        Loading…
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <CountersGrid c={data.counters} />
      <Bucket
        title="Failed payouts (curator attention)"
        tone="warning"
        empty="✓ No failed payouts"
        rows={data.failedPayouts}
        renderRow={(r) => (
          <PayoutRow key={r.id} row={r as FailedPayoutRow} />
        )}
      />
      <Bucket
        title="Stuck payouts (pending > 30 min)"
        tone="warning"
        empty="✓ No stuck payouts"
        rows={data.stuckPayouts}
        renderRow={(r) => (
          <PayoutRow key={r.id} row={r as StuckPayoutRow} />
        )}
      />
      <Bucket
        title="Awaiting victim verification (funded, not verified)"
        tone="neutral"
        empty="✓ No bounties stuck awaiting verification"
        rows={data.awaitingVerification}
        renderRow={(r) => (
          <AwaitingRowItem key={(r as AwaitingRow).publicId} row={r as AwaitingRow} />
        )}
      />
      <Bucket
        title="Unfunded drafts"
        tone="neutral"
        empty="✓ No unfunded drafts"
        rows={data.unfundedDrafts}
        renderRow={(r) => (
          <DraftRowItem key={(r as DraftRow).publicId} row={r as DraftRow} />
        )}
      />
    </div>
  );
}

function CountersGrid({ c }: { c: Counters }) {
  const items: Array<[string, number | string | undefined]> = [
    ["Drafts", c.drafts],
    ["Funded", c.funded],
    ["Open", c.open],
    ["Adjudicating", c.adjudicating],
    ["Paid", c.paid],
    ["Refunded", c.refunded],
    ["Expired", c.expired],
    [
      "Live escrow",
      c.live_escrow_usdc !== undefined
        ? `$${Number(c.live_escrow_usdc).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
        : "—",
    ],
  ];
  return (
    <section className="rex-card p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
      {items.map(([label, value]) => (
        <div key={label}>
          <div className="text-[9px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)]">
            {label}
          </div>
          <div className="font-display text-lg text-white">
            {value === undefined ? "—" : String(value)}
          </div>
        </div>
      ))}
    </section>
  );
}

function Bucket<T>({
  title,
  tone,
  empty,
  rows,
  renderRow,
}: {
  title: string;
  tone: "warning" | "neutral";
  empty: string;
  rows: T[];
  renderRow: (r: T) => React.ReactNode;
}) {
  const borderClass =
    tone === "warning"
      ? "border-[var(--rex-warning)]/40"
      : "border-[var(--rex-border-subtle)]";
  return (
    <section className={`rex-card p-4 border ${borderClass} space-y-2`}>
      <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)]">
        ● {title}{" "}
        <span className="text-[var(--rex-text-dim)]">({rows.length})</span>
      </div>
      {rows.length === 0 ? (
        <div className="text-[12px] font-mono text-[var(--rex-text-dim)]">
          {empty}
        </div>
      ) : (
        <ul className="space-y-1">{rows.map(renderRow)}</ul>
      )}
    </section>
  );
}

function PayoutRow({ row }: { row: StuckPayoutRow }) {
  const age = humanAge(row.createdAt);
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 text-[12px] font-mono border-b border-[var(--rex-border-subtle)] pb-1 last:border-0">
      <div>
        <span className="text-[var(--rex-text-muted)]">{row.payeeKind}</span>
        <span className="text-[var(--rex-text-dim)]"> · </span>
        <span className="text-white">${Number(row.amountUsdc).toFixed(2)}</span>
        {row.failureReason ? (
          <span className="text-[var(--rex-warning)]"> · {row.failureReason}</span>
        ) : null}
      </div>
      <div className="text-[10px] text-[var(--rex-text-dim)]">{age} old</div>
    </li>
  );
}

function AwaitingRowItem({ row }: { row: AwaitingRow }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 text-[12px] font-mono border-b border-[var(--rex-border-subtle)] pb-1 last:border-0">
      <div>
        <a
          href={`/bounties/${row.publicId}`}
          target="_blank"
          rel="noreferrer"
          className="text-[var(--rex-accent)] underline decoration-dotted underline-offset-2"
        >
          {row.publicId}
        </a>
        <span className="text-[var(--rex-text-dim)]"> · {row.kind} · </span>
        <span className="text-white">${Number(row.escrowedAmountUsdc).toFixed(0)} escrow</span>
        <span className="text-[var(--rex-text-dim)]"> · {row.victimEmail}</span>
      </div>
      <div className="text-[10px] text-[var(--rex-text-dim)]">
        {humanAge(row.createdAt)} old
      </div>
    </li>
  );
}

function DraftRowItem({ row }: { row: DraftRow }) {
  const ask =
    row.kind === "recovery"
      ? `${((row.recoveryPercentBps ?? 0) / 100).toFixed(0)}% recovered`
      : row.flatAmountUsdc
        ? `$${Number(row.flatAmountUsdc).toFixed(0)}`
        : "—";
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 text-[12px] font-mono border-b border-[var(--rex-border-subtle)] pb-1 last:border-0">
      <div>
        <span className="text-white">{row.publicId}</span>
        <span className="text-[var(--rex-text-dim)]"> · {row.kind} · </span>
        <span className="text-white">{ask}</span>
        <span className="text-[var(--rex-text-dim)]"> · {row.victimEmail}</span>
        {!row.circleWalletAddress ? (
          <span className="text-[var(--rex-warning)]"> · NO ESCROW WALLET</span>
        ) : null}
      </div>
      <div className="text-[10px] text-[var(--rex-text-dim)]">
        {humanAge(row.createdAt)} old
      </div>
    </li>
  );
}

function humanAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const h = ms / (60 * 60 * 1000);
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m`;
  if (h < 48) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}
