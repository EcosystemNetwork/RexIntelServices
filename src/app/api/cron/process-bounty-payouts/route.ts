import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { and, asc, eq, sql } from "drizzle-orm";
import {
  db,
  bounties,
  bountyPayouts,
  submitters,
} from "@/lib/db";
import { sendBountyPayout } from "@/lib/bounty-payout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Worst case 30 payouts × (1.5s Circle round trip + DB writes) ≈ 60s. Cap
// per-tick so the cron stays well within Vercel's 60s ceiling — leftover
// rows just wait for the next tick.
export const maxDuration = 60;

const BATCH_LIMIT = 25;

/**
 * GET /api/cron/process-bounty-payouts
 *
 * Drains `bounty_payouts.status='pending'`. For each row:
 *   1. Resolve source escrow wallet (bounty.circleWalletId) and the
 *      payee's destination address (submitters.walletAddress).
 *   2. Call sendBountyPayout — actual Circle DCW transfer when env is
 *      configured; logs + leaves row pending when not.
 *   3. Flip status to 'sent' (with transferId) or 'failed' (with reason).
 *      `skipped` outcomes leave the row pending for the next tick.
 *
 * Idempotency: the Circle transfer call is keyed off the payout UUID, so
 * a retry after a transient failure does NOT double-pay. The status
 * UPDATE is guarded by `status='pending'` so two concurrent ticks (Vercel
 * cron is supposed to be singleton but defense-in-depth) can't double-
 * process a row.
 *
 * Auth: Bearer ${CRON_SECRET}, timing-safe compare.
 */
export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  const expectedHeader = `Bearer ${expected}`;
  const presented = req.headers.get("authorization") ?? "";
  const a = Buffer.from(expectedHeader);
  const b = Buffer.from(
    presented.length === expectedHeader.length ? presented : expectedHeader,
  );
  if (
    presented.length !== expectedHeader.length ||
    !timingSafeEqual(a, b)
  ) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }

  // Pull pending payouts joined with the source bounty + payee submitter.
  const rows = await db
    .select({
      payoutId: bountyPayouts.id,
      amountUsdc: bountyPayouts.amountUsdc,
      payeeKind: bountyPayouts.payeeKind,
      payeeSubmitterId: bountyPayouts.payeeSubmitterId,
      sourceWalletId: bounties.circleWalletId,
      destinationAddress: submitters.walletAddress,
    })
    .from(bountyPayouts)
    .innerJoin(bounties, eq(bounties.id, bountyPayouts.bountyId))
    .leftJoin(
      submitters,
      eq(submitters.id, bountyPayouts.payeeSubmitterId),
    )
    .where(eq(bountyPayouts.status, "pending"))
    .orderBy(asc(bountyPayouts.createdAt))
    .limit(BATCH_LIMIT);

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const errors: Array<{ payoutId: string; reason: string }> = [];

  for (const row of rows) {
    const result = await sendBountyPayout({
      payoutId: row.payoutId,
      sourceWalletId: row.sourceWalletId,
      destinationAddress: row.destinationAddress,
      amountUsdc: String(row.amountUsdc),
    });

    if (result.kind === "sent") {
      // Guarded UPDATE — only flip if still pending so a concurrent
      // tick can't double-credit. We don't need a transaction here:
      // the worst race is two ticks both calling Circle with the same
      // idempotency key (which dedupes server-side), then one wins the
      // status UPDATE and the other no-ops.
      const updated = await db
        .update(bountyPayouts)
        .set({
          status: "sent",
          payoutTxHash: result.txHash ?? null,
          circleTransferId: result.transferId,
          sentAt: new Date(),
        })
        .where(
          and(
            eq(bountyPayouts.id, row.payoutId),
            eq(bountyPayouts.status, "pending"),
          ),
        )
        .returning({ id: bountyPayouts.id });
      if (updated.length > 0) sent += 1;
    } else if (result.kind === "failed") {
      await db
        .update(bountyPayouts)
        .set({
          // Retryable failures (Circle 5xx, network) stay 'pending' so the
          // next tick tries again; non-retryable failures (bad request,
          // insufficient funds) flip to 'failed' so they don't loop forever.
          status: result.retryable ? "pending" : "failed",
          failureReason: result.reason,
        })
        .where(eq(bountyPayouts.id, row.payoutId));
      failed += 1;
      errors.push({ payoutId: row.payoutId, reason: result.reason });
    } else {
      // skipped — leave row alone, log for ops visibility.
      skipped += 1;
      console.info(
        `[process-bounty-payouts] skipped payout ${row.payoutId} (${row.payeeKind}): ${result.reason}`,
      );
    }
  }

  // Best-effort: bump bounties.updatedAt for any bounty we touched, so the
  // public listing's "last activity" sort reflects payout activity. Doesn't
  // need to be exact.
  if (sent > 0) {
    const touchedIds = Array.from(
      new Set(
        rows.map((r) => r.payoutId).filter((id) => sent > 0 && id != null),
      ),
    );
    if (touchedIds.length > 0) {
      await db
        .update(bounties)
        .set({ updatedAt: sql`now()` })
        .where(
          sql`${bounties.id} IN (
            SELECT bounty_id FROM bounty_payouts WHERE id = ANY(${touchedIds})
          )`,
        );
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: rows.length,
    sent,
    failed,
    skipped,
    errors: errors.slice(0, 10),
    ranAt: new Date().toISOString(),
  });
}
