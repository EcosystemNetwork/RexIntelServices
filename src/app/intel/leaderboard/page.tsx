import Link from "next/link";
import type { Metadata } from "next";
import { desc } from "drizzle-orm";
import { db, monthlyPrizes } from "@/lib/db";
import type { SubmissionPayload } from "@/lib/db/schema";
import { PublicShell } from "@/components/public-shell";
import {
  fetchPoolBalance,
  getPrizePoolConfig,
  computePayouts,
  currentYearMonth,
  monthBounds,
  getMonthlyTopIntel,
} from "@/lib/prize-pool";
import {
  submissionTitle,
  submissionDetailHref,
  submissionTypeLabel,
  submissionIsAnonymous,
  type SubmissionType,
} from "@/lib/submission-display";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Leaderboard & Prize Pool — Rex Intel Services",
  description:
    "Community-funded monthly prize pool. The top community submissions each month — intel, capital, fellowships, grants, perks, events — split the payout. Vote on what matters; donate to grow the pot.",
};

type LeaderRow = {
  rank: number;
  publicId: string;
  type: SubmissionType;
  href: string;
  headline: string;
  laneLabel: string;
  submitterHandle: string | null;
  anonymous: boolean;
  voteCount: number;
};

export default async function LeaderboardPage() {
  const ym = currentYearMonth();

  // Use the shared getMonthlyTopIntel so the public leaderboard applies
  // the same cooling-window + self-vote exclusion as the admin dashboard
  // and the settlement cron. The inline query that used to live here
  // skipped both gates — Sybils showed on the public page even though
  // they wouldn't count at settlement, drifting the two surfaces.
  const [poolBalance, leaderRows, lastSettled] = await Promise.all([
    fetchPoolBalance(),
    getMonthlyTopIntel({ yearMonth: ym, limit: 20 }),
    db
      .select()
      .from(monthlyPrizes)
      .orderBy(desc(monthlyPrizes.yearMonth))
      .limit(1),
  ]);

  const leaders: LeaderRow[] = leaderRows.map((r, i) => {
    const type = r.type as SubmissionType;
    const payload = r.payload as SubmissionPayload;
    return {
      rank: i + 1,
      publicId: r.publicId,
      type,
      href: submissionDetailHref(type, r.publicId, payload),
      headline: submissionTitle(type, payload),
      laneLabel: submissionTypeLabel(type),
      submitterHandle: r.submitterHandle,
      anonymous: submissionIsAnonymous(type, payload),
      voteCount: r.voteCount,
    };
  });

  const config = getPrizePoolConfig();
  const payouts = computePayouts(poolBalance.amount);
  const { start: monthStart } = monthBounds(ym);
  const monthLabel = new Date(monthStart).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <PublicShell
      classification={[{ text: "● Open Channel // Community Prize Pool" }]}
    >
      <main className="max-w-5xl mx-auto px-6 pt-10 pb-24">
        <header className="mb-10">
          <p
            className="text-xs uppercase tracking-widest mb-2"
            style={{ color: "var(--rex-text-dim)" }}
          >
            ▸ Leaderboard · {monthLabel}
          </p>
          <h1 className="font-display text-4xl md:text-5xl font-semibold text-[var(--rex-text)] tracking-tight mb-3">
            Community Prize Pool
          </h1>
          <p
            className="text-base leading-relaxed max-w-2xl"
            style={{ color: "var(--rex-text-muted)" }}
          >
            Donors fund the pool. Operators vote. The top three community
            submissions each month — intel, capital, fellowships, grants,
            perks, events, anything you drop via /submit — split{" "}
            <strong className="text-[var(--rex-text)]">80%</strong> of the
            pool (60/30/10); the remaining 20% rolls to next month so the pot
            never empties.
          </p>
        </header>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-10">
          <div className="lg:col-span-2 rex-card p-7">
            <div
              className="text-[10px] font-mono uppercase tracking-widest mb-2"
              style={{ color: "var(--rex-text-dim)" }}
            >
              Current pool ·{" "}
              {poolBalance.source === "live"
                ? "live"
                : poolBalance.source === "mock"
                  ? "mock (dev)"
                  : "unconfigured"}
            </div>
            <div className="flex items-baseline gap-3 mb-4">
              <div className="font-display text-5xl md:text-6xl font-semibold text-[var(--rex-text)] tabular-nums">
                {formatMoney(poolBalance.amount)}
              </div>
              <div
                className="font-mono text-sm"
                style={{ color: "var(--rex-text-dim)" }}
              >
                {poolBalance.asset} · {poolBalance.chain.toUpperCase()}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mt-5">
              <PrizeSlot place="1st" amount={payouts.place1} subtitle="60%" />
              <PrizeSlot place="2nd" amount={payouts.place2} subtitle="30%" />
              <PrizeSlot place="3rd" amount={payouts.place3} subtitle="10%" />
            </div>
            <div
              className="text-[11px] font-mono mt-3"
              style={{ color: "var(--rex-text-dim)" }}
            >
              + {formatMoney(payouts.rollover)} {poolBalance.asset} rolls to
              next month
            </div>
          </div>

          <div className="rex-card p-6">
            <div
              className="text-[10px] font-mono uppercase tracking-widest mb-2"
              style={{ color: "var(--rex-accent)" }}
            >
              ▸ Donate to the pool
            </div>
            {config.walletAddress ? (
              <>
                <div className="mb-3 text-xs leading-relaxed" style={{ color: "var(--rex-text-muted)" }}>
                  Send <strong className="text-[var(--rex-text)]">{config.asset}</strong>{" "}
                  on <strong className="text-[var(--rex-text)]">{config.chain.toUpperCase()}</strong>{" "}
                  to:
                </div>
                <div
                  className="rounded-sm p-3 mb-3 font-mono text-[11px] break-all"
                  style={{
                    background: "var(--rex-bg)",
                    border: "1px solid var(--rex-border-subtle)",
                    color: "var(--rex-text-muted)",
                  }}
                >
                  {config.walletAddress}
                </div>
                {config.explorerUrl && (
                  <a
                    href={config.explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-mono uppercase tracking-widest"
                    style={{ color: "var(--rex-accent)" }}
                  >
                    Verify on explorer ▸
                  </a>
                )}
              </>
            ) : (
              <div
                className="text-xs"
                style={{ color: "var(--rex-text-dim)" }}
              >
                Pool wallet not configured yet. Coming soon — check back.
              </div>
            )}
          </div>
        </section>

        <section className="mb-10">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="font-display text-2xl font-medium text-[var(--rex-text)]">
              {monthLabel} leaders
            </h2>
            <Link
              href="/submit"
              className="text-[11px] font-mono uppercase tracking-widest"
              style={{ color: "var(--rex-accent)" }}
            >
              Drop intel ▸
            </Link>
          </div>

          {leaders.length === 0 ? (
            <div
              className="rex-card-flat p-12 text-center"
              style={{ color: "var(--rex-text-dim)" }}
            >
              No community submissions published this month yet. Be the first
              — drop intel, a fund, a fellowship, anything via /submit.
            </div>
          ) : (
            <ol className="space-y-2">
              {leaders.map((row) => {
                const podium = row.rank <= 3;
                return (
                  <li key={row.publicId}>
                    <Link
                      href={row.href}
                      className={`rex-card flex items-center gap-4 px-5 py-4 hover:bg-[var(--rex-surface-2)] transition-colors ${
                        podium ? "border-[var(--rex-accent)]" : ""
                      }`}
                    >
                      <div
                        className={`font-display text-2xl font-semibold tabular-nums w-10 text-center ${
                          podium
                            ? "text-[var(--rex-accent)]"
                            : "text-[var(--rex-text-dim)]"
                        }`}
                      >
                        {row.rank}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[var(--rex-text)] font-medium truncate">
                          {row.headline}
                        </div>
                        <div
                          className="text-[11px] font-mono mt-0.5 flex items-center gap-2"
                          style={{ color: "var(--rex-text-dim)" }}
                        >
                          <span className="uppercase tracking-widest">
                            {row.laneLabel}
                          </span>
                          <span>·</span>
                          <span>
                            {row.anonymous
                              ? "Anonymous"
                              : row.submitterHandle
                                ? `@${row.submitterHandle}`
                                : "Anonymous"}
                          </span>
                          {row.anonymous && (
                            <span
                              className="ml-1"
                              title="Anonymous submissions earn points but can't claim prizes"
                              style={{ color: "var(--rex-text-dim)" }}
                            >
                              · prize ineligible
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-display text-xl font-semibold text-[var(--rex-text)] tabular-nums">
                          {row.voteCount.toLocaleString()}
                        </div>
                        <div
                          className="text-[10px] font-mono uppercase tracking-widest"
                          style={{ color: "var(--rex-text-dim)" }}
                        >
                          {row.voteCount === 1 ? "vote" : "votes"}
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <section className="mb-10">
          <h2 className="font-display text-2xl font-medium text-[var(--rex-text)] mb-3">
            How it works
          </h2>
          <ul
            className="space-y-2 text-sm leading-relaxed"
            style={{ color: "var(--rex-text-muted)" }}
          >
            <li>
              <strong className="text-[var(--rex-text)]">1.</strong> Anyone donates{" "}
              {config.asset} on {config.chain.toUpperCase()} to the pool
              wallet above. Balance is public on-chain.
            </li>
            <li>
              <strong className="text-[var(--rex-text)]">2.</strong> Operators vote on
              any community submission published this month — intel, capital,
              fellowships, grants, perks, events. Magic-link confirm — one
              vote per email per submission.
            </li>
            <li>
              <strong className="text-[var(--rex-text)]">3.</strong> At month end, the
              top three split 80% of the pool (60/30/10). 20% rolls to next
              month so the pot is never zero.
            </li>
            <li>
              <strong className="text-[var(--rex-text)]">4.</strong> Winners with a
              listed submitter email are contacted directly. Anonymous
              submissions earn points but the prize rolls — no contact, no
              payout.
            </li>
          </ul>
          <p
            className="text-[11px] font-mono mt-4 leading-relaxed"
            style={{ color: "var(--rex-text-dim)" }}
          >
            Void where prohibited. Prize payouts may be subject to your
            local laws and tax reporting requirements. US winners receiving
            $600+ in a calendar year may receive a 1099-MISC.
          </p>
        </section>

        {lastSettled[0] && (
          <section>
            <h2 className="font-display text-2xl font-medium text-[var(--rex-text)] mb-3">
              Last settled month
            </h2>
            <div
              className="rex-card p-5 text-sm"
              style={{ color: "var(--rex-text-muted)" }}
            >
              <div className="font-mono text-[11px] uppercase tracking-widest mb-2">
                {lastSettled[0].yearMonth} ·{" "}
                {formatMoney(lastSettled[0].poolBalanceAtSettle)}{" "}
                {lastSettled[0].poolCurrency}
              </div>
              {lastSettled[0].payouts.length === 0 ? (
                <div>Settled with no payouts (full rollover).</div>
              ) : (
                <ul className="space-y-1">
                  {lastSettled[0].payouts.map((p, i) => (
                    <li key={i}>
                      Place {p.place}: {formatMoney(p.amount)}{" "}
                      {lastSettled[0].poolCurrency}
                      {p.txHash && (
                        <>
                          {" — "}
                          <a
                            className="underline"
                            href={
                              lastSettled[0].poolChain === "base"
                                ? `https://basescan.org/tx/${p.txHash}`
                                : `#`
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            tx
                          </a>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}
      </main>
    </PublicShell>
  );
}

function PrizeSlot({
  place,
  amount,
  subtitle,
}: {
  place: string;
  amount: string;
  subtitle: string;
}) {
  return (
    <div
      className="rounded-sm p-3 text-center"
      style={{
        background: "rgba(95,185,31,0.04)",
        border: "1px solid rgba(95,185,31,0.20)",
      }}
    >
      <div
        className="text-[10px] font-mono uppercase tracking-widest mb-1"
        style={{ color: "var(--rex-accent)" }}
      >
        {place} · {subtitle}
      </div>
      <div className="font-display text-xl font-semibold text-[var(--rex-text)] tabular-nums">
        {formatMoney(amount)}
      </div>
    </div>
  );
}

function formatMoney(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
