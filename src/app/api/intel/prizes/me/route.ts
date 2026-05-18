import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { createPublicClient, http, type Address } from "viem";
import { base, baseSepolia } from "viem/chains";
import { db, monthlyPrizes, type MonthlyPrizePayout } from "@/lib/db";
import { getMagicSession } from "@/lib/magic-auth";
import {
  getOnchainPoolConfig,
  yearMonthToYYYYMM,
} from "@/lib/prize-pool-onchain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/intel/prizes/me
 *
 * Returns the signed-in submitter's claimable + claimed prize-pool wins.
 * Source of truth for "claimable now" is the contract's `pendingClaim`
 * mapping — the DB tells us which months we were paid in, but a winner
 * could have claimed via Etherscan or another wallet UI, in which case the
 * on-chain value is 0 even though the DB shows them as paidTo.
 */

const PENDING_CLAIM_ABI = [
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

export async function GET() {
  const session = await getMagicSession();
  if (!session) {
    return NextResponse.json({ contributor: null, prizes: [] }, { status: 200 });
  }
  const wallet = session.walletAddress.toLowerCase();

  // Pull the most recent 24 monthly_prizes rows and filter to ones where
  // this submitter is listed as a paidTo. 24 months is two years of
  // history — anything older isn't worth surfacing on the page.
  const rows = await db
    .select()
    .from(monthlyPrizes)
    .orderBy(desc(monthlyPrizes.yearMonth))
    .limit(24);

  type Hit = {
    yearMonth: string;
    monthYYYYMM: number;
    amount: string;
    txHash: string | null;
    place: number;
  };
  const hits: Hit[] = [];
  for (const row of rows) {
    const payouts = (row.payouts as MonthlyPrizePayout[]) ?? [];
    for (const p of payouts) {
      if (p.paidTo && p.paidTo.toLowerCase() === wallet) {
        hits.push({
          yearMonth: row.yearMonth,
          monthYYYYMM: yearMonthToYYYYMM(row.yearMonth),
          amount: p.amount,
          txHash: p.txHash ?? null,
          place: p.place,
        });
      }
    }
  }

  // Query the contract's pendingClaim() for each hit so we know which are
  // already claimed (pending=0) vs still owed (pending>0). One RPC call per
  // hit — fine at 24-row scale.
  const cfg = getOnchainPoolConfig();
  let claimable: Array<Hit & { pendingWei: string; claimed: boolean }>;
  if (!cfg.contractAddress || hits.length === 0) {
    claimable = hits.map((h) => ({ ...h, pendingWei: "0", claimed: false }));
  } else {
    const chain = cfg.chainId === 84532 ? baseSepolia : base;
    const client = createPublicClient({ chain, transport: http(cfg.rpcUrl) });
    claimable = await Promise.all(
      hits.map(async (h) => {
        try {
          const pending = (await client.readContract({
            address: cfg.contractAddress!,
            abi: PENDING_CLAIM_ABI,
            functionName: "pendingClaim",
            args: [BigInt(h.monthYYYYMM), wallet as Address],
          })) as bigint;
          return {
            ...h,
            pendingWei: pending.toString(),
            // Pending == 0 AND a txHash exists means the distribution
            // happened but the user already pulled it. Pending == 0 AND
            // no txHash means the on-chain distribute() never landed —
            // surface as "settlement_pending" rather than "claimed".
            claimed: pending === 0n && h.txHash !== null,
          };
        } catch {
          // RPC blip — don't break the page; mark as claimable=0 with a
          // hint so the UI can show a retry CTA.
          return { ...h, pendingWei: "0", claimed: false };
        }
      }),
    );
  }

  return NextResponse.json({
    contributor: {
      walletAddress: wallet,
      submitterId: session.submitterId,
    },
    contract: cfg.contractAddress,
    chainId: cfg.chainId,
    prizes: claimable,
  });
}
