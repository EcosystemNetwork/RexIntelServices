import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import {
  db,
  monthlyPrizes,
  submitters,
  submissions,
  type MonthlyPrizePayout,
} from "@/lib/db";
import { verifyCronSecret } from "@/lib/cron-auth";
import {
  computePayouts5,
  currentYearMonth,
  fetchPoolBalance,
  getMonthlyTopIntel,
} from "@/lib/prize-pool";
import { awardPrizeWin } from "@/lib/magic-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/settle-monthly-prizes
 *
 * Daily idempotent settlement. For every prior UTC month with no
 * monthly_prizes row, snapshots:
 *   - the pool balance via fetchPoolBalance (bypassCache)
 *   - the top-3 cooled, self-vote-excluded intel
 *   - the 60/30/10-of-80% / 20%-rollover payout split via computePayouts
 *
 * Then writes one monthly_prizes row (unique index on year_month dedupes
 * concurrent settlement attempts) and calls awardPrizeWin for each
 * placement so the recipient's contribution-event ledger reflects the win.
 *
 * v0 (testnet ETH): does NOT trigger on-chain transfers. Once the pool
 * graduates to USDC-on-Base mainnet, the actual transfer step lands in
 * /api/cron/process-bounty-payouts (or its prize-pool sibling) — the
 * monthly_prizes payouts array is the queue source.
 *
 * Sweep window: settles every prior month back to the project epoch
 * 2026-04 (one month before the prize pool design was committed
 * 2026-05-16). Sweep is capped at the past 6 months per run so a paused
 * cron doesn't blast the DB on resume.
 */

const SETTLE_BACKFILL_MONTHS = 6;
// First month that could have voted intel — anything before this is
// definitely empty and we don't need a row for it.
const EPOCH_YEAR_MONTH = "2026-04";

function priorYearMonth(ym: string, monthsBack: number): string {
  const [yearStr, monthStr] = ym.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr) - 1; // 0-indexed
  const d = new Date(Date.UTC(year, month - monthsBack, 1));
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function compareYearMonth(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export async function GET(req: Request) {
  const fail = verifyCronSecret(req);
  if (fail) return NextResponse.json(fail.body, { status: fail.status });

  const nowYm = currentYearMonth();

  // Build the set of candidate prior months [nowYm - SETTLE_BACKFILL_MONTHS,
  // nowYm) bounded below by EPOCH_YEAR_MONTH.
  const candidates: string[] = [];
  for (let i = 1; i <= SETTLE_BACKFILL_MONTHS; i += 1) {
    const ym = priorYearMonth(nowYm, i);
    if (compareYearMonth(ym, EPOCH_YEAR_MONTH) < 0) break;
    candidates.unshift(ym);
  }

  // Fetch already-settled rows in one go so we don't issue N "exists"
  // queries.
  const settledRows = await db
    .select({ yearMonth: monthlyPrizes.yearMonth })
    .from(monthlyPrizes)
    .where(sql`${monthlyPrizes.yearMonth} = ANY(${candidates})`);
  const settled = new Set(settledRows.map((r) => r.yearMonth));

  const settledOut: Array<{
    yearMonth: string;
    poolAmount: string;
    placesPaid: number;
    skipped?: string;
  }> = [];

  for (const ym of candidates) {
    if (settled.has(ym)) continue;

    // Snapshot pool balance LIVE — bypass the in-process cache so we don't
    // pin to a stale value when settlement fires after a long idle window.
    const balance = await fetchPoolBalance({ bypassCache: true });
    const poolAmount = balance.amount;
    const payouts = computePayouts5(poolAmount);

    // Snapshot top-5. The waterfall is 50/25/15/7/3 of 80% — see
    // computePayouts5 + the IntelPrizePool contract. Even if there are
    // <5 voted intels we still write the row so the month is marked
    // settled (the unfilled places contribute to rollover).
    const top = await getMonthlyTopIntel({ yearMonth: ym, limit: 5 });

    const placeAmounts = [
      payouts.place1,
      payouts.place2,
      payouts.place3,
      payouts.place4,
      payouts.place5,
    ];
    const payoutRows: MonthlyPrizePayout[] = top
      .filter((row) => row.voteCount > 0)
      .slice(0, 5)
      .map((row, idx) => ({
        place: idx + 1,
        submissionId: row.publicId,
        amount: placeAmounts[idx]!,
        notes:
          row.submitterEmail == null
            ? "anonymous_intel_no_payout"
            : undefined,
      }));

    // Resolve submission DB ids and submitter ids for the awardPrizeWin
    // calls. We selected publicId in payoutRows; map back to (id,
    // submitterId).
    const publicIds = payoutRows.map((p) => p.submissionId);
    const submissionRows = publicIds.length
      ? await db
          .select({
            publicId: submissions.publicId,
            id: submissions.id,
            submitterEmail: submissions.submitterEmail,
          })
          .from(submissions)
          .where(sql`${submissions.publicId} = ANY(${publicIds})`)
      : [];
    const idsByPublic = new Map(
      submissionRows.map((r) => [r.publicId, r]),
    );

    // Idempotent insert: unique index on year_month means a concurrent
    // cron tick that beat us to this row gets onConflictDoNothing and we
    // skip the awardPrizeWin step for the loser.
    const [inserted] = await db
      .insert(monthlyPrizes)
      .values({
        yearMonth: ym,
        poolBalanceAtSettle: poolAmount,
        poolCurrency: balance.asset,
        poolChain: balance.chain,
        payouts: payoutRows,
        settledAt: new Date(),
      })
      .onConflictDoNothing()
      .returning({ id: monthlyPrizes.id });

    if (!inserted) {
      settledOut.push({
        yearMonth: ym,
        poolAmount,
        placesPaid: 0,
        skipped: "raced_by_concurrent_tick",
      });
      continue;
    }

    // Award contribution-event points for each placement. Anonymous-intel
    // submitters (no submitterEmail) earn nothing — the points ledger is
    // identity-keyed and we don't write phantom rows.
    for (const payout of payoutRows) {
      const submissionRow = idsByPublic.get(payout.submissionId);
      if (!submissionRow || !submissionRow.submitterEmail) continue;
      const [submitterRow] = await db
        .select({ id: submitters.id })
        .from(submitters)
        .where(
          sql`lower(${submitters.email}) = lower(${submissionRow.submitterEmail})`,
        )
        .limit(1);
      if (!submitterRow) continue;
      try {
        await awardPrizeWin({
          submitterId: submitterRow.id,
          place: payout.place,
          submissionId: submissionRow.id,
          notes: `monthly_prize ${ym} place_${payout.place}`,
        });
      } catch (err) {
        // Best-effort — a failed points award doesn't unwind the
        // monthly_prizes row. Recovered by re-running awardPrizeWin from
        // an admin tool against the same submission.
        console.warn(
          `[settle-monthly-prizes] awardPrizeWin failed for ${ym} place ${payout.place}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    settledOut.push({
      yearMonth: ym,
      poolAmount,
      placesPaid: payoutRows.length,
    });
  }

  return NextResponse.json({
    ok: true,
    candidates,
    settled: settledOut,
    ranAt: new Date().toISOString(),
  });
}
