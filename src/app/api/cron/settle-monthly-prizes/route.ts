import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
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
import {
  submitDistribute,
  yearMonthToYYYYMM,
} from "@/lib/prize-pool-onchain";
import { awardPrizeWin } from "@/lib/magic-auth";
import { sendOpsAlert } from "@/lib/email/admin-alert-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 300s gives waitForTransactionReceipt (90s) + DB writes (~1s) +
// up-to-6-months backfill loop plenty of headroom. The prior 60s cap
// guaranteed lambda kill mid-await on the first slow Base inclusion,
// leaving the monthly_prizes row written but the txHash never patched.
export const maxDuration = 300;

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
 * concurrent settlement attempts), calls IntelPrizePool.distribute() on
 * Base mainnet via the settler EOA, and awards contribution-event points
 * for each placement.
 *
 * On-chain settlement is best-effort and idempotent: a failed distribute()
 * leaves the monthly_prizes row in place with empty txHashes; the next
 * cron tick re-tries and submitDistribute() pre-flights against the
 * contract's `distributed` mapping so we never double-pay. If
 * PRIZE_POOL_ADDRESS or SETTLER_PRIVATE_KEY is unset the on-chain step is
 * skipped cleanly with onchainStatus="skipped_no_contract".
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
    onchainStatus?: string;
    txHash?: string;
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

    // Resolve submission ids (for the awardPrizeWin call) and submitter
    // wallet addresses (for the on-chain distribute() call) in a single
    // pair of bulk lookups, then enrich payoutRows accordingly.
    //
    // Drop zero-amount slots BEFORE persisting. When the pool is tiny
    // (~$0.42 or less), the 3%-of-80% place-5 share rounds to "0.00";
    // without this filter we'd write a row with paidTo set + amount
    // "0.00", then `submitDistribute` strips the on-chain slot, and
    // the claim UI reports `claimed:true` for a never-paid winner
    // (pendingClaim==0 + txHash!=null = claimed branch in /api/intel/
    // prizes/me).
    const initial = top
      .filter((row) => row.voteCount > 0)
      .slice(0, 5)
      .map((row, idx) => ({
        place: idx + 1,
        publicId: row.publicId,
        submitterEmail: row.submitterEmail,
        amount: placeAmounts[idx]!,
      }))
      .filter((r) => Number(r.amount) > 0);
    const publicIds = initial.map((r) => r.publicId);
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
    const idsByPublic = new Map(submissionRows.map((r) => [r.publicId, r]));

    const emails = submissionRows
      .map((r) => r.submitterEmail?.toLowerCase())
      .filter((e): e is string => !!e);
    const submitterRows = emails.length
      ? await db
          .select({
            id: submitters.id,
            email: submitters.email,
            walletAddress: submitters.walletAddress,
          })
          .from(submitters)
          .where(sql`lower(${submitters.email}) = ANY(${emails})`)
      : [];
    const submitterByEmail = new Map(
      submitterRows
        .filter((s) => !!s.email)
        .map((s) => [s.email!.toLowerCase(), s]),
    );

    const payoutRows: MonthlyPrizePayout[] = initial.map((r) => {
      const submission = idsByPublic.get(r.publicId);
      if (!submission || !submission.submitterEmail) {
        return {
          place: r.place,
          submissionId: r.publicId,
          amount: r.amount,
          notes: "anonymous_intel_no_payout",
        };
      }
      const submitter = submitterByEmail.get(
        submission.submitterEmail.toLowerCase(),
      );
      if (!submitter || !submitter.walletAddress) {
        // Email-known submitter without a Magic-provisioned wallet —
        // they need to log in via Magic Link OTP at least once to mint
        // their dedicated wallet, then we can pay them.
        return {
          place: r.place,
          submissionId: r.publicId,
          amount: r.amount,
          notes: "no_wallet",
        };
      }
      return {
        place: r.place,
        submissionId: r.publicId,
        amount: r.amount,
        paidTo: submitter.walletAddress.toLowerCase(),
      };
    });

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

    // On-chain settlement — sign + send distribute() from the settler EOA.
    // Failures here do NOT unwind the monthly_prizes row (the off-chain
    // settlement record is independent of the on-chain transfer). Re-runs
    // are safe: submitDistribute() pre-flights against the contract's
    // `distributed` mapping and returns "already_distributed" without
    // sending a tx.
    let onchainStatus: string = "skipped";
    let txHash: string | undefined;
    try {
      const winnersToDistribute = payoutRows
        .filter((p): p is MonthlyPrizePayout & { paidTo: string } => !!p.paidTo)
        .map((p) => ({
          address: p.paidTo as `0x${string}`,
          amount: p.amount,
        }));
      const result = await submitDistribute({
        monthYYYYMM: yearMonthToYYYYMM(ym),
        winners: winnersToDistribute,
      });
      onchainStatus = result.status;
      if (result.status === "submitted") {
        txHash = result.txHash;
        const patched = payoutRows.map((p) =>
          p.paidTo ? { ...p, txHash: result.txHash } : p,
        );
        await db
          .update(monthlyPrizes)
          .set({ payouts: patched })
          .where(eq(monthlyPrizes.id, inserted.id));
      }
    } catch (err) {
      onchainStatus = "errored";
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(
        `[settle-monthly-prizes] distribute() failed for ${ym}:`,
        reason,
      );
      // This is the cron that moves USDC monthly. A silent fail here
      // costs a month of prize-pool distribution; without on-call we
      // need email-on-error. Rate-limited so a persistent misconfig
      // doesn't bury the admin inbox.
      await sendOpsAlert({
        key: `settle-monthly-prizes:errored:${ym}`,
        subject: `[Ops] Monthly prize distribute() failed: ${ym}`,
        message: `IntelPrizePool.distribute() threw for month ${ym}.\n\nReason: ${reason}\n\nThe monthly_prizes row was written off-chain; on-chain payout has NOT fired. Re-runs are safe (the contract pre-flights against distributed[month]).\n\nCheck: PRIZE_POOL_ADDRESS, SETTLER_PRIVATE_KEY, Base mainnet RPC, settler EOA balance for gas.`,
      });
    }

    // Award contribution-event points for each placement. Anonymous-intel
    // submitters (no submitterEmail) earn nothing — the points ledger is
    // identity-keyed and we don't write phantom rows. Uses the
    // submitterByEmail map populated above so no extra round-trip.
    for (const payout of payoutRows) {
      const submissionRow = idsByPublic.get(payout.submissionId);
      if (!submissionRow || !submissionRow.submitterEmail) continue;
      const submitter = submitterByEmail.get(
        submissionRow.submitterEmail.toLowerCase(),
      );
      if (!submitter) continue;
      try {
        await awardPrizeWin({
          submitterId: submitter.id,
          place: payout.place,
          submissionId: submissionRow.id,
          notes: `monthly_prize ${ym} place_${payout.place}`,
        });
      } catch (err) {
        // Best-effort — a failed points award doesn't unwind the
        // monthly_prizes row. Recovered by re-running awardPrizeWin from
        // an admin tool against the same submission.
        const reason = err instanceof Error ? err.message : String(err);
        console.warn(
          `[settle-monthly-prizes] awardPrizeWin failed for ${ym} place ${payout.place}:`,
          reason,
        );
        await sendOpsAlert({
          key: `settle-monthly-prizes:award-failed:${ym}`,
          subject: `[Ops] Prize-win points award failed: ${ym} place ${payout.place}`,
          message: `awardPrizeWin threw for ${ym} place ${payout.place}.\n\nSubmitter: ${submitter.id}\nSubmission: ${submissionRow.id}\nReason: ${reason}`,
        });
      }
    }

    settledOut.push({
      yearMonth: ym,
      poolAmount,
      placesPaid: payoutRows.length,
      onchainStatus,
      txHash,
    });
  }

  return NextResponse.json({
    ok: true,
    candidates,
    settled: settledOut,
    ranAt: new Date().toISOString(),
  });
}
