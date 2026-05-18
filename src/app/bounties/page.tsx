import Link from "next/link";
import type { Metadata } from "next";
import { desc, inArray } from "drizzle-orm";
import { db, bounties, hackTraces } from "@/lib/db";
import { PublicShell } from "@/components/public-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Recovery Bounties · RexIntel",
  description:
    "Victims of crypto theft post USDC bounties for information that leads to recovery (or, with a filed police report, arrest). White-hat researchers at the trusted clearance tier can claim. Custodial escrow on Base.",
};

type BountyRow = {
  publicId: string;
  kind: "recovery" | "info_recovery" | "info_arrest";
  status: "open" | "adjudicating" | "paid" | "funded" | "draft" | "refunded" | "expired";
  recoveryPercentBps: number | null;
  flatAmountUsdc: string | null;
  escrowedAmountUsdc: string;
  policeReportFiled: boolean;
  expiresAt: Date;
  createdAt: Date;
  traceChain: string | null;
  traceRoot: string | null;
};

async function loadBounties(): Promise<BountyRow[]> {
  const rows = await db
    .select({
      publicId: bounties.publicId,
      kind: bounties.kind,
      status: bounties.status,
      recoveryPercentBps: bounties.recoveryPercentBps,
      flatAmountUsdc: bounties.flatAmountUsdc,
      escrowedAmountUsdc: bounties.escrowedAmountUsdc,
      policeReportFiled: bounties.policeReportFiled,
      expiresAt: bounties.expiresAt,
      createdAt: bounties.createdAt,
      hackTraceId: bounties.hackTraceId,
    })
    .from(bounties)
    .where(inArray(bounties.status, ["open", "adjudicating", "paid"] as const))
    .orderBy(desc(bounties.createdAt))
    .limit(100);

  if (rows.length === 0) return [];

  // Pull trace context for chain + truncated root display.
  const traceIds = Array.from(
    new Set(rows.map((r) => r.hackTraceId).filter((id): id is string => !!id)),
  );
  const traceRows = traceIds.length
    ? await db
        .select({
          id: hackTraces.id,
          chain: hackTraces.chain,
          rootAddress: hackTraces.rootAddress,
        })
        .from(hackTraces)
        .where(inArray(hackTraces.id, traceIds))
    : [];
  const tracesById = new Map(traceRows.map((t) => [t.id, t]));

  return rows.map((r) => {
    const tr = r.hackTraceId ? tracesById.get(r.hackTraceId) : undefined;
    return {
      publicId: r.publicId,
      kind: r.kind,
      status: r.status,
      recoveryPercentBps: r.recoveryPercentBps,
      flatAmountUsdc: r.flatAmountUsdc,
      escrowedAmountUsdc: r.escrowedAmountUsdc,
      policeReportFiled: r.policeReportFiled,
      expiresAt: r.expiresAt,
      createdAt: r.createdAt,
      traceChain: tr?.chain ?? null,
      traceRoot: tr?.rootAddress ?? null,
    };
  });
}

const KIND_LABEL: Record<BountyRow["kind"], string> = {
  recovery: "Recovery",
  info_recovery: "Info → Recovery",
  info_arrest: "Info → Arrest",
};

const STATUS_TONE: Record<BountyRow["status"], { bg: string; fg: string }> = {
  open: { bg: "rgba(95,185,31,0.12)", fg: "var(--rex-accent)" },
  adjudicating: { bg: "rgba(251,191,36,0.12)", fg: "var(--rex-warning)" },
  paid: { bg: "rgba(168,85,247,0.10)", fg: "#c4b5fd" },
  funded: { bg: "rgba(95,185,31,0.06)", fg: "var(--rex-accent)" },
  draft: { bg: "rgba(255,255,255,0.04)", fg: "var(--rex-text-dim)" },
  refunded: { bg: "rgba(255,255,255,0.04)", fg: "var(--rex-text-dim)" },
  expired: { bg: "rgba(255,255,255,0.04)", fg: "var(--rex-text-dim)" },
};

function formatAmount(b: BountyRow): string {
  if (b.kind === "recovery") {
    const pct = (b.recoveryPercentBps ?? 0) / 100;
    return `${pct.toFixed(pct % 1 === 0 ? 0 : 1)}% of recovered funds`;
  }
  const usdc = Number(b.flatAmountUsdc ?? "0");
  if (usdc >= 1_000_000) return `$${(usdc / 1_000_000).toFixed(2)}M USDC`;
  if (usdc >= 1_000) return `$${(usdc / 1_000).toFixed(1)}K USDC`;
  return `$${usdc.toFixed(0)} USDC`;
}

function truncateAddr(a: string): string {
  return `${a.slice(0, 10)}…${a.slice(-6)}`;
}

function daysLeft(expiresAt: Date): string {
  const ms = expiresAt.getTime() - Date.now();
  if (ms <= 0) return "expired";
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
  if (days === 1) return "1 day left";
  if (days <= 30) return `${days} days left`;
  const weeks = Math.round(days / 7);
  return `${weeks} weeks left`;
}

export default async function BountiesIndexPage() {
  const rows = await loadBounties();

  return (
    <PublicShell
      classification={[
        { text: "● Public · Recovery bounties" },
        { text: "USDC on Base · Custodial escrow", show: "sm" },
        { text: "Trusted-tier claims", show: "md" },
      ]}
    >
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <header className="space-y-2">
          <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-accent)]">
            ● Recovery bounties
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-[var(--rex-text)]">
            Pay white-hats to find your stolen funds.
          </h1>
          <p className="text-sm text-[var(--rex-text-muted)] max-w-2xl leading-relaxed">
            Victims escrow USDC on Base. Trusted-tier researchers submit
            sealed evidence packages. A curator + the victim sign off
            before payout. Bad-faith claims slash the claimant&apos;s bond
            and burn a strike — two strikes is a permanent ban from the
            bounty surface.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              href="/bounties/new"
              className="text-[11px] font-mono uppercase tracking-widest px-3 py-2 rounded border border-[var(--rex-accent)]/40 text-[var(--rex-accent)] hover:bg-[var(--rex-accent)]/10 transition"
            >
              Post a bounty →
            </Link>
            <Link
              href="/trace"
              className="text-[11px] font-mono uppercase tracking-widest px-3 py-2 rounded border border-[var(--rex-border-subtle)] text-[var(--rex-text-muted)] hover:text-[var(--rex-text)] transition"
            >
              Trace your wallet first →
            </Link>
          </div>
        </header>

        {rows.length === 0 ? (
          <section className="rex-card p-6 text-center">
            <div className="text-sm text-[var(--rex-text-muted)]">
              No live bounties yet. Run a trace and post the first one.
            </div>
          </section>
        ) : (
          <section className="space-y-3">
            {rows.map((b) => {
              const tone = STATUS_TONE[b.status];
              return (
                <Link
                  key={b.publicId}
                  href={`/bounties/${b.publicId}`}
                  className="block rex-card p-4 sm:p-5 hover:border-[var(--rex-accent)]/40 transition"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded"
                          style={{ background: tone.bg, color: tone.fg }}
                        >
                          {b.status}
                        </span>
                        <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)]">
                          {KIND_LABEL[b.kind]}
                        </span>
                        {b.policeReportFiled ? (
                          <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-warning)]">
                            · Police report on file
                          </span>
                        ) : null}
                      </div>
                      <div className="font-display text-lg text-[var(--rex-text)]">
                        {formatAmount(b)}
                      </div>
                      {b.traceRoot ? (
                        <div className="text-[11px] font-mono text-[var(--rex-text-muted)]">
                          {b.traceChain} · {truncateAddr(b.traceRoot)}
                        </div>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)]">
                        Escrow
                      </div>
                      <div className="text-sm font-mono text-[var(--rex-text)]">
                        ${Number(b.escrowedAmountUsdc).toFixed(0)}
                      </div>
                      <div className="text-[10px] font-mono text-[var(--rex-text-dim)] mt-1">
                        {daysLeft(b.expiresAt)}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </section>
        )}

        <section className="text-[11px] text-[var(--rex-text-dim)] font-mono leading-relaxed border-t border-[var(--rex-border-subtle)] pt-4 space-y-2">
          <div>
            Accepted claims write to the public attribution graph as
            <span className="text-[var(--rex-accent)]"> bounty-claim</span>{" "}
            source — curator + victim ack on top of on-chain evidence ranks
            above raw victim-trace in the moat layer.
          </div>
          <div>
            No platform fee today. Bounties are escrowed in a custodial
            Circle wallet on Base and paid out to claimants&apos; Circle
            wallets after the verdict.
          </div>
        </section>
      </main>
    </PublicShell>
  );
}
