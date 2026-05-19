import { NextResponse } from "next/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { createPublicClient, http, parseAbiItem, type Address, type Hex } from "viem";
import { base, baseSepolia } from "viem/chains";
import { db, bounties, bountyClaims, type BountyStatus } from "@/lib/db";
import { verifyCronSecret } from "@/lib/cron-auth";
import {
  formatUsdc,
  getOnchainEscrowConfig,
  readBond,
  readPrincipal,
  uuidToKey,
} from "@/lib/bounty-escrow";
import { sendOpsAlert } from "@/lib/email/admin-alert-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/index-bounty-escrow
 *
 * Hourly indexer: pulls on-chain state from BountyEscrow and flips the
 * matching DB rows.
 *
 * Two passes:
 *
 *   1. Bounty funding. For every DB row in status ∈ {draft, funded},
 *      read principal[bountyKey] from the contract. If principal is
 *      non-zero, update escrowed_amount_usdc to the on-chain value and
 *      flip status:
 *        - draft → funded (always — funds arrived but victim may still
 *          need to verify)
 *        - funded → open (only when victim_verified_at is set AND the
 *          principal meets the expected threshold)
 *      The threshold for kind ∈ {info_recovery, info_arrest} is
 *      flat_amount_usdc; for kind=recovery any non-zero principal is
 *      enough (the recovery share is computed against recovered funds
 *      later).
 *
 *   2. Bond posting. For every DB row in status ∈ {submitted,
 *      under_review, needs_info} with bond_tx_hash IS NULL, read
 *      bonds[claimKey]. If a bond is observed, populate bond_tx_hash
 *      with the corresponding BondPosted event's tx hash (looked up
 *      via eth_getLogs over a recent window).
 *
 * Idempotent: re-reads return the same observed state; updates only
 * fire on first observation.
 *
 * Auth: Bearer ${CRON_SECRET}.
 */

// Lookback window for BondPosted log scan. ~12h on Base (2s blocks).
const BLOCK_LOOKBACK = 21_600n;

const BOND_POSTED_EVENT = parseAbiItem(
  "event BondPosted(bytes32 indexed claimKey, bytes32 indexed bountyKey, address indexed claimant, uint256 amount)",
);

const BOUNTY_FUNDED_EVENT = parseAbiItem(
  "event BountyFunded(bytes32 indexed bountyKey, address indexed from, uint256 amount, uint256 principalAfter)",
);

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

  try {
  const chain = cfg.chainId === 84532 ? baseSepolia : base;
  const client = createPublicClient({ chain, transport: http(cfg.rpcUrl) });
  const latestBlock = await client.getBlockNumber();
  const fromBlock = latestBlock > BLOCK_LOOKBACK ? latestBlock - BLOCK_LOOKBACK : 0n;

  let bountiesFunded = 0;
  let bountiesOpened = 0;
  let bondsObserved = 0;

  // ── Pass 1: bounty funding ─────────────────────────────────────────
  const draftish = await db
    .select({
      id: bounties.id,
      publicId: bounties.publicId,
      kind: bounties.kind,
      status: bounties.status,
      flatAmountUsdc: bounties.flatAmountUsdc,
      escrowedAmountUsdc: bounties.escrowedAmountUsdc,
      victimVerifiedAt: bounties.victimVerifiedAt,
      fundingTxHash: bounties.fundingTxHash,
    })
    .from(bounties)
    .where(inArray(bounties.status, ["draft", "funded"] as const));

  // One eth_getLogs over the window for BountyFunded events — cheaper than
  // N RPC calls. We index events by bountyKey for fast lookup.
  const fundedLogs = await client.getLogs({
    address: cfg.contractAddress as Address,
    event: BOUNTY_FUNDED_EVENT,
    fromBlock,
    toBlock: latestBlock,
  });
  const firstFundTxByKey = new Map<string, Hex>();
  for (const log of fundedLogs) {
    const key = (log.args.bountyKey as Hex).toLowerCase();
    if (!firstFundTxByKey.has(key)) firstFundTxByKey.set(key, log.transactionHash);
  }

  for (const b of draftish) {
    const bountyKey = uuidToKey(b.id);
    const principal = await readPrincipal(bountyKey);
    if (principal === 0n) continue;

    const principalUsdc = formatUsdc(principal);

    // Threshold logic — what counts as "funded".
    let meetsThreshold: boolean;
    if (b.kind === "recovery") {
      meetsThreshold = principal > 0n;
    } else {
      const threshold = Number(b.flatAmountUsdc ?? "0");
      meetsThreshold = Number(principalUsdc) >= threshold;
    }

    // Status decision:
    //   - draft + meetsThreshold + verified → open
    //   - draft + meetsThreshold → funded (waiting on victim verify)
    //   - funded + verified → open
    //   - otherwise stay put but still record principal
    let nextStatus: BountyStatus | null = null;
    if (b.status === "draft" && meetsThreshold) {
      nextStatus = b.victimVerifiedAt ? "open" : "funded";
    } else if (b.status === "funded" && b.victimVerifiedAt && meetsThreshold) {
      nextStatus = "open";
    }

    const fundingTxHash =
      b.fundingTxHash ?? firstFundTxByKey.get(bountyKey.toLowerCase()) ?? null;

    const updates: Partial<typeof bounties.$inferInsert> = {
      escrowedAmountUsdc: principalUsdc,
      updatedAt: new Date(),
    };
    if (fundingTxHash && !b.fundingTxHash) updates.fundingTxHash = fundingTxHash;
    if (nextStatus) updates.status = nextStatus;

    await db.update(bounties).set(updates).where(eq(bounties.id, b.id));

    if (nextStatus === "funded") bountiesFunded += 1;
    if (nextStatus === "open") bountiesOpened += 1;
  }

  // ── Pass 2: bond posting ────────────────────────────────────────────
  const pendingBondClaims = await db
    .select({
      id: bountyClaims.id,
      publicId: bountyClaims.publicId,
      bountyId: bountyClaims.bountyId,
      bondAmountUsdc: bountyClaims.bondAmountUsdc,
    })
    .from(bountyClaims)
    .where(
      and(
        inArray(bountyClaims.status, [
          "submitted",
          "under_review",
          "needs_info",
        ] as const),
        isNull(bountyClaims.bondTxHash),
      ),
    );

  if (pendingBondClaims.length > 0) {
    const bondLogs = await client.getLogs({
      address: cfg.contractAddress as Address,
      event: BOND_POSTED_EVENT,
      fromBlock,
      toBlock: latestBlock,
    });
    const firstBondTxByKey = new Map<string, Hex>();
    for (const log of bondLogs) {
      const key = (log.args.claimKey as Hex).toLowerCase();
      if (!firstBondTxByKey.has(key)) firstBondTxByKey.set(key, log.transactionHash);
    }

    for (const c of pendingBondClaims) {
      const claimKey = uuidToKey(c.id);
      const bond = await readBond(claimKey);
      if (bond.amount === 0n) continue;

      const txHash = firstBondTxByKey.get(claimKey.toLowerCase());
      await db
        .update(bountyClaims)
        .set({
          bondTxHash: txHash ?? `observed:${cfg.chainId}:${claimKey}`,
          lastTouchedAt: new Date(),
        })
        .where(eq(bountyClaims.id, c.id));
      bondsObserved += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    bountiesFunded,
    bountiesOpened,
    bondsObserved,
    scannedFromBlock: fromBlock.toString(),
    scannedToBlock: latestBlock.toString(),
    ranAt: new Date().toISOString(),
  });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[index-bounty-escrow] failed:", err);
    await sendOpsAlert({
      key: "index-bounty-escrow:errored",
      subject: "[Ops] Bounty escrow indexer failed",
      message: `On-chain indexer threw against ${cfg.contractAddress} on chain ${cfg.chainId}. Bounties may stall in draft/funded without status flips.\n\n${message}`,
    });
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
