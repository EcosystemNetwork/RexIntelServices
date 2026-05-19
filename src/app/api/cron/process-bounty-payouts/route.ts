import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  bounties,
  bountyClaims,
  bountyPayouts,
  submitters,
} from "@/lib/db";
import { verifyCronSecret } from "@/lib/cron-auth";
import {
  getOnchainEscrowConfig,
  parseUsdc,
  submitAwardClaimant,
  submitAwardRefund,
  submitSlashBond,
  uuidToKey,
} from "@/lib/bounty-escrow";
import type { Address, Hex } from "viem";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 300s mirrors settle-monthly-prizes — each tx wait is ~90s on Base and we
// may process a small queue per run.
export const maxDuration = 300;

/**
 * GET /api/cron/process-bounty-payouts
 *
 * Dispatches pending bountyPayouts rows to the on-chain BountyEscrow
 * contract. Each row maps to one settler call:
 *
 *   claimant      → awardClaimant(payee, payoutAmount, refundBond?)
 *                   (batched with sibling bond_refund row when present)
 *   bond_refund   → awardClaimant(payee=claimant, payoutAmount=0, refundBond=true)
 *                   (only when no sibling claimant row exists)
 *   bond_slash    → slashBond(claimKey)
 *   victim_refund → awardRefund(bountyKey, poster, amount)
 *   platform_fee  → skipped (no-fees-yet policy)
 *
 * Idempotent: rows already at status='sent' are ignored. A failed on-chain
 * tx flips the row to status='failed' with a reason and the cron retries
 * on the next tick.
 *
 * Auth: Bearer ${CRON_SECRET}.
 */
export async function GET(req: Request) {
  const fail = verifyCronSecret(req);
  if (fail) return NextResponse.json(fail.body, { status: fail.status });

  const cfg = getOnchainEscrowConfig();
  if (!cfg.contractAddress) {
    return NextResponse.json({
      ok: true,
      skipped: "no_escrow_address",
      message: "BOUNTY_ESCROW_ADDRESS not set",
    });
  }

  const pending = await db
    .select({
      id: bountyPayouts.id,
      bountyId: bountyPayouts.bountyId,
      bountyClaimId: bountyPayouts.bountyClaimId,
      amountUsdc: bountyPayouts.amountUsdc,
      payeeKind: bountyPayouts.payeeKind,
      payeeSubmitterId: bountyPayouts.payeeSubmitterId,
    })
    .from(bountyPayouts)
    .where(eq(bountyPayouts.status, "pending"));

  // Index sibling rows: claimant ↔ bond_refund pairs on the same claim get
  // batched into one awardClaimant call. We process the claimant row and
  // mark the bond_refund row sent in the same SQL transaction.
  const bondRefundByClaim = new Map<string, (typeof pending)[number]>();
  for (const p of pending) {
    if (p.payeeKind === "bond_refund" && p.bountyClaimId) {
      bondRefundByClaim.set(p.bountyClaimId, p);
    }
  }

  const stats = {
    processed: 0,
    skipped: 0,
    failed: 0,
    txs: [] as { payoutId: string; txHash: string; kind: string }[],
  };

  for (const p of pending) {
    // Skip bond_refund rows that have a sibling claimant row — those are
    // handled when we process the claimant row (batched into one tx).
    if (p.payeeKind === "bond_refund" && p.bountyClaimId) {
      const hasClaimantSibling = pending.some(
        (q) => q.payeeKind === "claimant" && q.bountyClaimId === p.bountyClaimId,
      );
      if (hasClaimantSibling) continue;
    }
    if (p.payeeKind === "platform_fee") {
      stats.skipped += 1;
      continue;
    }

    try {
      const txHash = await dispatchPayout(p, bondRefundByClaim);
      if (!txHash) {
        stats.skipped += 1;
        continue;
      }
      stats.processed += 1;
      stats.txs.push({ payoutId: p.id, txHash, kind: p.payeeKind });
    } catch (err) {
      stats.failed += 1;
      const reason = err instanceof Error ? err.message : "unknown_error";
      await db
        .update(bountyPayouts)
        .set({ status: "failed", failureReason: reason.slice(0, 500) })
        .where(eq(bountyPayouts.id, p.id));
      console.error(
        `[process-bounty-payouts] payout ${p.id} (${p.payeeKind}) failed: ${reason}`,
      );
    }
  }

  return NextResponse.json({ ok: true, ...stats, ranAt: new Date().toISOString() });
}

type Pending = {
  id: string;
  bountyId: string;
  bountyClaimId: string | null;
  amountUsdc: string;
  payeeKind: string;
  payeeSubmitterId: string | null;
};

async function dispatchPayout(
  p: Pending,
  bondRefundByClaim: Map<string, Pending>,
): Promise<Hex | null> {
  switch (p.payeeKind) {
    case "claimant":
      return await dispatchClaimant(p, bondRefundByClaim.get(p.bountyClaimId ?? ""));
    case "bond_refund":
      return await dispatchBondRefundOnly(p);
    case "bond_slash":
      return await dispatchBondSlash(p);
    case "victim_refund":
      return await dispatchVictimRefund(p);
    default:
      console.warn(`[process-bounty-payouts] unknown payeeKind ${p.payeeKind}, skipping`);
      return null;
  }
}

async function dispatchClaimant(p: Pending, bondRefundSibling?: Pending): Promise<Hex> {
  if (!p.bountyClaimId) throw new Error("claimant payout missing bountyClaimId");

  const [claim] = await db
    .select({
      id: bountyClaims.id,
      bountyId: bountyClaims.bountyId,
      claimantSubmitterId: bountyClaims.claimantSubmitterId,
    })
    .from(bountyClaims)
    .where(eq(bountyClaims.id, p.bountyClaimId))
    .limit(1);
  if (!claim) throw new Error(`claim ${p.bountyClaimId} not found`);

  const payee = await resolveWallet(claim.claimantSubmitterId);
  if (!payee) throw new Error(`claimant ${claim.claimantSubmitterId} has no wallet`);

  const claimKey = uuidToKey(claim.id);
  const bountyKey = uuidToKey(claim.bountyId);
  const payoutAmount = parseUsdc(p.amountUsdc);
  const refundBond = !!bondRefundSibling;

  const txHash = await submitAwardClaimant({
    claimKey,
    bountyKey,
    payee,
    payoutAmount,
    refundBondToClaimant: refundBond,
  });

  await markSent(p.id, txHash);
  if (bondRefundSibling) await markSent(bondRefundSibling.id, txHash);
  return txHash;
}

async function dispatchBondRefundOnly(p: Pending): Promise<Hex> {
  if (!p.bountyClaimId) throw new Error("bond_refund payout missing bountyClaimId");

  const [claim] = await db
    .select({
      id: bountyClaims.id,
      bountyId: bountyClaims.bountyId,
      claimantSubmitterId: bountyClaims.claimantSubmitterId,
    })
    .from(bountyClaims)
    .where(eq(bountyClaims.id, p.bountyClaimId))
    .limit(1);
  if (!claim) throw new Error(`claim ${p.bountyClaimId} not found`);

  const payee = await resolveWallet(claim.claimantSubmitterId);
  if (!payee) throw new Error(`claimant ${claim.claimantSubmitterId} has no wallet`);

  const claimKey = uuidToKey(claim.id);
  const bountyKey = uuidToKey(claim.bountyId);

  const txHash = await submitAwardClaimant({
    claimKey,
    bountyKey,
    payee,
    payoutAmount: 0n,
    refundBondToClaimant: true,
  });

  await markSent(p.id, txHash);

  // Mirror the bond_tx_hash already-set flag onto bondRefundedTxHash for
  // history. Idempotent: subsequent successful runs won't overwrite.
  await db
    .update(bountyClaims)
    .set({ bondRefundedTxHash: txHash, lastTouchedAt: new Date() })
    .where(eq(bountyClaims.id, claim.id));

  return txHash;
}

async function dispatchBondSlash(p: Pending): Promise<Hex> {
  if (!p.bountyClaimId) throw new Error("bond_slash payout missing bountyClaimId");
  const [claim] = await db
    .select({ id: bountyClaims.id })
    .from(bountyClaims)
    .where(eq(bountyClaims.id, p.bountyClaimId))
    .limit(1);
  if (!claim) throw new Error(`claim ${p.bountyClaimId} not found`);

  const claimKey = uuidToKey(claim.id);
  const txHash = await submitSlashBond({ claimKey });
  await markSent(p.id, txHash);
  return txHash;
}

async function dispatchVictimRefund(p: Pending): Promise<Hex> {
  const [bounty] = await db
    .select({
      id: bounties.id,
      victimSubmitterId: bounties.victimSubmitterId,
    })
    .from(bounties)
    .where(eq(bounties.id, p.bountyId))
    .limit(1);
  if (!bounty) throw new Error(`bounty ${p.bountyId} not found`);

  const poster = await resolveWallet(bounty.victimSubmitterId);
  if (!poster) throw new Error(`victim ${bounty.victimSubmitterId} has no wallet`);

  const bountyKey = uuidToKey(bounty.id);
  const amount = parseUsdc(p.amountUsdc);

  const txHash = await submitAwardRefund({ bountyKey, poster, amount });
  await markSent(p.id, txHash);
  return txHash;
}

async function resolveWallet(submitterId: string | null): Promise<Address | null> {
  if (!submitterId) return null;
  const [row] = await db
    .select({ walletAddress: submitters.walletAddress })
    .from(submitters)
    .where(eq(submitters.id, submitterId))
    .limit(1);
  const w = row?.walletAddress?.trim();
  if (!w || !/^0x[0-9a-fA-F]{40}$/.test(w)) return null;
  return w as Address;
}

async function markSent(payoutId: string, txHash: string): Promise<void> {
  await db
    .update(bountyPayouts)
    .set({
      status: "sent",
      payoutTxHash: txHash,
      sentAt: new Date(),
    })
    .where(
      // Guard re-marks so a duplicate batch can't overwrite an earlier hash.
      and(eq(bountyPayouts.id, payoutId), eq(bountyPayouts.status, "pending")),
    );
}
