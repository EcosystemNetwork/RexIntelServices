import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import {
  createPublicClient,
  http,
  formatUnits,
  type Address,
} from "viem";
import { base, baseSepolia } from "viem/chains";
import { requireOperator } from "@/lib/auth";
import { db, monthlyPrizes, type MonthlyPrizePayout } from "@/lib/db";
import {
  getOnchainPoolConfig,
  yearMonthToYYYYMM,
} from "@/lib/prize-pool-onchain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/prizes/reconcile?ym=YYYY-MM
 *
 * Cross-reference the off-chain `monthly_prizes` snapshot against the
 * on-chain IntelPrizePool state for a given month. Surfaces every
 * possible drift mode in one shot:
 *
 *   - DB says paid_to=0xWinner but contract `pendingClaim` is 0 with no
 *     DB txHash → cron submitted but receipt was missed (orphan state)
 *   - DB says paid_to=0xWinner but contract `pendingClaim` is 0 with a
 *     DB txHash → winner already claimed (healthy state)
 *   - DB row exists but contract `distributed[ym]` is false → cron wrote
 *     the off-chain snapshot but distribute() never landed on-chain
 *   - DB row missing but contract `distributed[ym]` is true → ???
 *     (would only happen if a non-cron path called distribute, or the
 *     DB row was manually deleted)
 *
 * No writes — pure read. Operator-only.
 *
 * When `?ym=` is omitted, returns the most recent 6 months of summary
 * (each month's distributed flag, payouts count, claim-state breakdown).
 */

const PRIZE_POOL_ABI = [
  {
    type: "function",
    name: "distributed",
    stateMutability: "view",
    inputs: [{ name: "month", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "distributedAt",
    stateMutability: "view",
    inputs: [{ name: "month", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "pendingClaim",
    stateMutability: "view",
    inputs: [
      { name: "month", type: "uint256" },
      { name: "winner", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

type DriftStatus =
  | "ok_claimed"
  | "ok_pending"
  | "orphan_no_txhash"
  | "drift_not_distributed_onchain"
  | "drift_db_row_missing";

type PayoutReconciliation = {
  place: number;
  paidTo: string | null;
  dbAmountUsdc: string;
  dbTxHash: string | null;
  onchainPendingUsdc: string | null;
  status: DriftStatus;
};

type MonthReconciliation = {
  yearMonth: string;
  monthYYYYMM: number;
  distributedOnchain: boolean;
  distributedAtOnchain: string | null;
  dbRowExists: boolean;
  poolBalanceAtSettleUsdc: string | null;
  settledAt: string | null;
  payouts: PayoutReconciliation[];
  notes: string[];
};

export async function GET(req: NextRequest) {
  const auth = await requireOperator(req);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const yearMonth = url.searchParams.get("ym");

  const cfg = getOnchainPoolConfig();
  if (!cfg.contractAddress) {
    return NextResponse.json(
      {
        ok: false,
        error: "PRIZE_POOL_ADDRESS not set — nothing to reconcile against.",
      },
      { status: 400 },
    );
  }

  const chain = cfg.chainId === 84532 ? baseSepolia : base;
  const client = createPublicClient({ chain, transport: http(cfg.rpcUrl) });

  // Build the set of months to reconcile.
  let targets: string[];
  if (yearMonth) {
    if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
      return NextResponse.json(
        { ok: false, error: "ym must be YYYY-MM" },
        { status: 400 },
      );
    }
    targets = [yearMonth];
  } else {
    const recent = await db
      .select({ yearMonth: monthlyPrizes.yearMonth })
      .from(monthlyPrizes)
      .orderBy(desc(monthlyPrizes.yearMonth))
      .limit(6);
    targets = recent.map((r) => r.yearMonth);
  }

  const results: MonthReconciliation[] = [];
  for (const ym of targets) {
    results.push(await reconcileMonth(ym, cfg.contractAddress, client));
  }

  const driftCount = results.reduce(
    (acc, r) =>
      acc +
      r.payouts.filter((p) =>
        p.status === "orphan_no_txhash" ||
        p.status === "drift_not_distributed_onchain" ||
        p.status === "drift_db_row_missing",
      ).length,
    0,
  );

  return NextResponse.json({
    ok: driftCount === 0,
    driftCount,
    months: results,
  });
}

async function reconcileMonth(
  yearMonth: string,
  contractAddress: Address,
  client: ReturnType<typeof createPublicClient>,
): Promise<MonthReconciliation> {
  const monthYYYYMM = yearMonthToYYYYMM(yearMonth);
  const notes: string[] = [];

  // Pull the DB row (if any).
  const [row] = await db
    .select()
    .from(monthlyPrizes)
    .where(eq(monthlyPrizes.yearMonth, yearMonth))
    .limit(1);

  // Pull the on-chain distributed flag + timestamp.
  const [distributedOnchain, distributedAtOnchain] = await Promise.all([
    client.readContract({
      address: contractAddress,
      abi: PRIZE_POOL_ABI,
      functionName: "distributed",
      args: [BigInt(monthYYYYMM)],
    }) as Promise<boolean>,
    client.readContract({
      address: contractAddress,
      abi: PRIZE_POOL_ABI,
      functionName: "distributedAt",
      args: [BigInt(monthYYYYMM)],
    }) as Promise<bigint>,
  ]);

  if (!row) {
    if (distributedOnchain) {
      notes.push(
        "ON-CHAIN STATE WITHOUT DB ROW — distribute() landed but the monthly_prizes row is missing. Investigate manually.",
      );
    }
    return {
      yearMonth,
      monthYYYYMM,
      distributedOnchain,
      distributedAtOnchain:
        distributedAtOnchain > 0n
          ? new Date(Number(distributedAtOnchain) * 1000).toISOString()
          : null,
      dbRowExists: false,
      poolBalanceAtSettleUsdc: null,
      settledAt: null,
      payouts: [],
      notes,
    };
  }

  const payouts = (row.payouts as MonthlyPrizePayout[] | null) ?? [];
  const reconciledPayouts: PayoutReconciliation[] = [];

  for (const p of payouts) {
    if (!p.paidTo) {
      // Anonymous / no-wallet winners — no on-chain entry to compare.
      reconciledPayouts.push({
        place: p.place,
        paidTo: null,
        dbAmountUsdc: p.amount,
        dbTxHash: null,
        onchainPendingUsdc: null,
        status: "ok_pending",
      });
      continue;
    }

    const pending = (await client.readContract({
      address: contractAddress,
      abi: PRIZE_POOL_ABI,
      functionName: "pendingClaim",
      args: [BigInt(monthYYYYMM), p.paidTo as Address],
    })) as bigint;

    const status = classifyDrift({
      distributedOnchain,
      dbTxHash: p.txHash ?? null,
      pending,
    });

    reconciledPayouts.push({
      place: p.place,
      paidTo: p.paidTo,
      dbAmountUsdc: p.amount,
      dbTxHash: p.txHash ?? null,
      onchainPendingUsdc: formatUnits(pending, 6),
      status,
    });
  }

  if (!distributedOnchain && payouts.some((p) => p.paidTo)) {
    notes.push(
      "DB ROW WITHOUT ON-CHAIN DISTRIBUTE — paidTo set on at least one payout but distributed[month]=false. Re-run the settle cron; submitDistribute() will pre-flight and submit if needed.",
    );
  }

  return {
    yearMonth,
    monthYYYYMM,
    distributedOnchain,
    distributedAtOnchain:
      distributedAtOnchain > 0n
        ? new Date(Number(distributedAtOnchain) * 1000).toISOString()
        : null,
    dbRowExists: true,
    poolBalanceAtSettleUsdc: row.poolBalanceAtSettle ?? null,
    settledAt: row.settledAt?.toISOString() ?? null,
    payouts: reconciledPayouts,
    notes,
  };
}

function classifyDrift(args: {
  distributedOnchain: boolean;
  dbTxHash: string | null;
  pending: bigint;
}): DriftStatus {
  if (!args.distributedOnchain) return "drift_not_distributed_onchain";
  // Distributed on-chain. Now the (pending, txHash) combo tells us:
  if (args.pending === 0n) {
    return args.dbTxHash ? "ok_claimed" : "orphan_no_txhash";
  }
  return "ok_pending";
}
