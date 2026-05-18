import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { and, eq, isNotNull, isNull, lt } from "drizzle-orm";
import { db, bountyPayouts } from "@/lib/db";
import { getTransactionState } from "@/lib/bounty-payout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_LIMIT = 50;

/**
 * GET /api/cron/backfill-payout-tx-hashes
 *
 * Circle's developer-controlled transfer endpoint returns INITIATED with a
 * transferId immediately; the on-chain txHash arrives seconds-to-minutes
 * later as the tx confirms. This cron polls `GET /v1/w3s/developer/
 * transactions/{id}` for any payout where:
 *
 *   - status = 'sent'
 *   - circle_transfer_id IS NOT NULL
 *   - payout_tx_hash IS NULL
 *   - sent_at older than 30s (avoid racing with the same-tick fresh send)
 *
 * On state COMPLETE / CONFIRMED, the txHash is written back. On state
 * FAILED / CANCELLED / DENIED, the payout flips to 'failed' with the
 * reason so the operator sees it surface in the admin queue.
 *
 * Idempotent: safe to run alongside the inbound webhook handler (which
 * acks outbound state events but does not write txHashes itself).
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

  // 30-second floor so a payout sent in the SAME tick as this cron isn't
  // polled before Circle has a chance to register the txHash.
  const floor = new Date(Date.now() - 30_000);

  const rows = await db
    .select({
      id: bountyPayouts.id,
      circleTransferId: bountyPayouts.circleTransferId,
    })
    .from(bountyPayouts)
    .where(
      and(
        eq(bountyPayouts.status, "sent"),
        isNull(bountyPayouts.payoutTxHash),
        isNotNull(bountyPayouts.circleTransferId),
        lt(bountyPayouts.sentAt, floor),
      ),
    )
    .limit(BATCH_LIMIT);

  let updated = 0;
  let stillPending = 0;
  let failed = 0;
  let skipped = 0;
  const errors: Array<{ payoutId: string; reason: string }> = [];

  for (const row of rows) {
    if (!row.circleTransferId) continue;
    const result = await getTransactionState(row.circleTransferId);

    if (result.kind === "skipped") {
      skipped += 1;
      continue;
    }
    if (result.kind === "failed") {
      errors.push({ payoutId: row.id, reason: result.reason });
      continue;
    }

    const state = result.state;
    if (
      state === "COMPLETE" ||
      state === "CONFIRMED" ||
      state === "SENT"
    ) {
      if (result.txHash) {
        await db
          .update(bountyPayouts)
          .set({ payoutTxHash: result.txHash })
          .where(eq(bountyPayouts.id, row.id));
        updated += 1;
      } else {
        // SENT state without txHash yet — still in flight; come back next tick.
        stillPending += 1;
      }
    } else if (
      state === "FAILED" ||
      state === "CANCELLED" ||
      state === "DENIED"
    ) {
      // Circle rejected the transfer after we marked it sent. Flip back
      // to 'failed' so it surfaces in the admin queue for re-attempt.
      // Note: this is a rare path — Circle typically rejects synchronously
      // in the transfer call. But chain-side or compliance-flag rejections
      // can land here.
      await db
        .update(bountyPayouts)
        .set({
          status: "failed",
          failureReason: `circle_state_${state.toLowerCase()}`,
        })
        .where(eq(bountyPayouts.id, row.id));
      failed += 1;
    } else {
      // INITIATED / QUEUED / PENDING_RISK_SCREENING — still in flight.
      stillPending += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: rows.length,
    updated,
    stillPending,
    failed,
    skipped,
    errors: errors.slice(0, 10),
    ranAt: new Date().toISOString(),
  });
}
