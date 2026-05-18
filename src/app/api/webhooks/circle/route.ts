import { NextRequest, NextResponse } from "next/server";
import { createPublicKey, createVerify } from "crypto";
import { eq, sql } from "drizzle-orm";
import { db, bounties } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/circle
 *
 * Inbound webhook handler for Circle notifications. The two events we care
 * about today are inbound USDC transfers landing in one of our per-bounty
 * escrow wallets and outbound transfer state updates (so we can backfill
 * txHash without polling).
 *
 * Configuration in Circle Console → Webhooks:
 *   URL    : https://<site>/api/webhooks/circle
 *   Events : transactions.created, transactions.updated (the docs use
 *            these names; older docs say "transactions"; both shapes are
 *            handled below).
 *
 * Signature verification: Circle signs webhook bodies with their
 * notification public key (RSA-SHA256). Set CIRCLE_WEBHOOK_PUBLIC_KEY to
 * the PEM-encoded public key from Circle Console → Webhooks → Public Key.
 * The signature arrives in the X-Circle-Signature header (base64).
 *
 * Idempotency: every webhook delivery includes a `notification.id` that
 * Circle reuses on retries. We dedupe by storing the last-seen id per
 * payout/bounty when we apply effects; redelivery is safe because the
 * UPDATE … WHERE escrowedAmountUsdc + amount logic is monotonic.
 */

interface CircleNotification {
  notificationId?: string;
  notificationType?: string;
  notification?: {
    transaction?: CircleTransaction;
  };
  // Some older payloads put the transaction at the top level.
  transaction?: CircleTransaction;
}

interface CircleTransaction {
  id: string;
  state?: string;
  blockchain?: string;
  sourceAddress?: string;
  destinationAddress?: string;
  walletId?: string; // present for outbound; for inbound this is the destination wallet
  amounts?: string[];
  tokenId?: string;
  tokenAddress?: string;
  txHash?: string;
  /** "OUTBOUND" | "INBOUND" — drives our branching */
  transactionType?: string;
}

export async function POST(req: NextRequest) {
  // ── 1. Signature verification ─────────────────────────────────────────
  const publicKeyPem = process.env.CIRCLE_WEBHOOK_PUBLIC_KEY;
  if (!publicKeyPem) {
    console.error(
      "[circle-webhook] CIRCLE_WEBHOOK_PUBLIC_KEY not configured — refusing webhook",
    );
    return NextResponse.json(
      { ok: false, error: "webhook_not_configured" },
      { status: 500 },
    );
  }
  const signature = req.headers.get("x-circle-signature");
  const keyId = req.headers.get("x-circle-key-id"); // sometimes present
  const rawBody = await req.text();
  if (!signature) {
    return NextResponse.json(
      { ok: false, error: "missing_signature" },
      { status: 401 },
    );
  }
  try {
    const verifier = createVerify("RSA-SHA256");
    verifier.update(rawBody);
    verifier.end();
    const publicKey = createPublicKey(publicKeyPem);
    const ok = verifier.verify(publicKey, signature, "base64");
    if (!ok) {
      console.warn(
        `[circle-webhook] signature verification failed (keyId=${keyId ?? "?"})`,
      );
      return NextResponse.json(
        { ok: false, error: "invalid_signature" },
        { status: 401 },
      );
    }
  } catch (err) {
    console.warn("[circle-webhook] signature verify error", err);
    return NextResponse.json(
      { ok: false, error: "signature_verify_failed" },
      { status: 401 },
    );
  }

  // ── 2. Parse body ─────────────────────────────────────────────────────
  let event: CircleNotification;
  try {
    event = JSON.parse(rawBody) as CircleNotification;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }
  const tx = event.notification?.transaction ?? event.transaction;
  if (!tx) {
    // Non-transaction events (e.g., wallet provisioning callbacks) ack OK.
    return NextResponse.json({ ok: true, ignored: "no_transaction" });
  }

  // ── 3. Inbound transfer → resolve bounty + call fund handler ─────────
  // Only ACT on terminal-good states (CONFIRMED / COMPLETE). INITIATED
  // events fire while the tx is still mempool-pending; acting on them
  // would let an attacker double-credit by replacing a tx pre-confirmation.
  const stateOk =
    tx.state === "CONFIRMED" || tx.state === "COMPLETE";
  if (!stateOk) {
    return NextResponse.json({
      ok: true,
      ignored: "non_terminal_state",
      state: tx.state ?? null,
    });
  }

  if (tx.transactionType === "INBOUND" && tx.destinationAddress) {
    const result = await handleInboundTransfer(tx);
    return NextResponse.json({ ok: true, ...result });
  }

  // ── 4. Outbound transfer state update → tx-hash backfill ─────────────
  // We could update bounty_payouts.payoutTxHash here directly, but the
  // dedicated cron polls anyway as a fallback. Keep this lean — just log
  // for ops visibility.
  if (tx.transactionType === "OUTBOUND" && tx.id) {
    return NextResponse.json({
      ok: true,
      action: "outbound_acked",
      transferId: tx.id,
      txHash: tx.txHash ?? null,
    });
  }

  return NextResponse.json({ ok: true, ignored: "no_handler_for_shape" });
}

async function handleInboundTransfer(tx: CircleTransaction) {
  if (!tx.destinationAddress || !tx.amounts || tx.amounts.length === 0) {
    return { action: "skipped", reason: "missing_dest_or_amount" };
  }
  const destLower = tx.destinationAddress.toLowerCase();
  const amount = Number(tx.amounts[0]);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { action: "skipped", reason: "invalid_amount" };
  }

  // Reverse-lookup: which bounty owns this destination wallet?
  const [bounty] = await db
    .select({
      id: bounties.id,
      publicId: bounties.publicId,
      status: bounties.status,
      escrowedAmountUsdc: bounties.escrowedAmountUsdc,
      flatAmountUsdc: bounties.flatAmountUsdc,
      kind: bounties.kind,
      victimVerifiedAt: bounties.victimVerifiedAt,
    })
    .from(bounties)
    .where(sql`lower(${bounties.circleWalletAddress}) = ${destLower}`)
    .limit(1);

  if (!bounty) {
    // Unknown destination — could be a wallet provisioned but not yet
    // linked, or a stray transfer. Log for ops, ack OK so Circle stops
    // retrying.
    console.warn(
      `[circle-webhook] inbound transfer to unknown wallet ${destLower}, amount=${amount}, txHash=${tx.txHash}`,
    );
    return { action: "skipped", reason: "no_bounty_for_destination" };
  }

  if (bounty.status !== "draft" && bounty.status !== "funded") {
    // Top-ups to an already-open / paid / expired bounty are noise; log
    // and skip. The funds stay in the escrow wallet for the operator to
    // sweep manually.
    console.warn(
      `[circle-webhook] inbound to bounty ${bounty.publicId} in status=${bounty.status}, ignoring ${amount} USDC`,
    );
    return {
      action: "skipped",
      reason: "bounty_not_fundable",
      bounty: bounty.publicId,
      status: bounty.status,
    };
  }

  // Apply the funding status-machine in-process — same logic that was
  // previously exposed through a separate /fund route. Status transitions:
  // draft → funded (escrow + verification) → open.
  const newEscrowed = Number(bounty.escrowedAmountUsdc ?? "0") + amount;
  const posted =
    bounty.kind === "recovery" ? 0 : Number(bounty.flatAmountUsdc ?? "0");
  const escrowSatisfied = newEscrowed >= Math.max(posted, 1);
  const victimVerified = bounty.victimVerifiedAt != null;
  const shouldOpen = escrowSatisfied && victimVerified;

  await db
    .update(bounties)
    .set({
      escrowedAmountUsdc: sql`${bounties.escrowedAmountUsdc} + ${amount.toFixed(2)}`,
      fundingTxHash: tx.txHash ?? null,
      status: shouldOpen ? "open" : "funded",
      updatedAt: new Date(),
    })
    .where(eq(bounties.id, bounty.id));

  return {
    action: "funded",
    bounty: bounty.publicId,
    escrowedAmountUsdc: newEscrowed.toFixed(2),
    status: shouldOpen ? "open" : "funded",
    nextAction: shouldOpen
      ? "claim_window_open"
      : !escrowSatisfied
        ? "need_more_escrow"
        : "need_victim_verification",
  };
}
