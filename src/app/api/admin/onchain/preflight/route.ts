import { NextRequest, NextResponse } from "next/server";
import {
  createPublicClient,
  http,
  formatEther,
  type Address,
  type Hex,
} from "viem";
import { base, baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { requireOperator } from "@/lib/auth";
import {
  getOnchainPoolConfig,
  readPoolUsdcBalance,
} from "@/lib/prize-pool-onchain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/onchain/preflight
 *
 * Operator-only pre-deploy / pre-cron sanity check for the IntelPrizePool
 * on-chain integration. Resolves env config, derives the settler EOA
 * from SETTLER_PRIVATE_KEY, reads the contract's `settler()` to confirm
 * the on-chain settler matches our derived address, and reports gas +
 * USDC balances so the operator can verify the rail is fundable before
 * the 1st-of-month cron fires.
 *
 * This is the single check Rex should run after pushing PRIZE_POOL_ADDRESS
 * to Vercel. A green response = the cron will be able to call distribute()
 * when it next fires.
 */

const SETTLER_ABI = [
  {
    type: "function",
    name: "settler",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "USDC",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

type CheckResult = { ok: boolean; detail: string };

function parsePrivateKey(v: string | undefined): Hex | null {
  if (!v) return null;
  const trimmed = v.trim();
  const withPrefix = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(withPrefix)) return null;
  return withPrefix as Hex;
}

export async function GET(req: NextRequest) {
  const auth = await requireOperator(req);
  if (auth instanceof NextResponse) return auth;

  const checks: Record<string, CheckResult> = {};

  // 1. Config parse — also catches malformed PRIZE_POOL_ADDRESS now that
  //    parseAddress throws instead of returning null.
  let cfg: ReturnType<typeof getOnchainPoolConfig>;
  try {
    cfg = getOnchainPoolConfig();
    checks.config = {
      ok: true,
      detail: `chainId=${cfg.chainId} contract=${cfg.contractAddress ?? "(unset)"} token=${cfg.tokenContract}`,
    };
  } catch (err) {
    checks.config = {
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    };
    return NextResponse.json({ ok: false, checks }, { status: 200 });
  }

  // 2. Settler key parse + EOA derivation.
  const pk = parsePrivateKey(process.env.SETTLER_PRIVATE_KEY);
  if (!pk) {
    checks.settlerKey = {
      ok: false,
      detail:
        "SETTLER_PRIVATE_KEY missing or malformed (expect 0x-prefixed 32-byte hex)",
    };
    return NextResponse.json({ ok: false, checks }, { status: 200 });
  }
  const account = privateKeyToAccount(pk);
  const settlerEoa = account.address as Address;
  checks.settlerKey = {
    ok: true,
    detail: `derived EOA=${settlerEoa}`,
  };

  // From here on we hit the chain — if PRIZE_POOL_ADDRESS isn't set,
  // bail with a partial report rather than failing the request.
  if (!cfg.contractAddress) {
    return NextResponse.json(
      {
        ok: false,
        checks,
        note: "PRIZE_POOL_ADDRESS not set — on-chain checks skipped. Deploy the contract and set the env var to enable full preflight.",
      },
      { status: 200 },
    );
  }

  const chain = cfg.chainId === 84532 ? baseSepolia : base;
  const client = createPublicClient({ chain, transport: http(cfg.rpcUrl) });

  // 3. Contract reachability + settler() match.
  try {
    const onchainSettler = (await client.readContract({
      address: cfg.contractAddress,
      abi: SETTLER_ABI,
      functionName: "settler",
    })) as Address;
    const match =
      onchainSettler.toLowerCase() === settlerEoa.toLowerCase();
    checks.settlerOnchainMatch = {
      ok: match,
      detail: match
        ? `on-chain settler=${onchainSettler} == derived EOA`
        : `MISMATCH: on-chain settler=${onchainSettler} but our key derives ${settlerEoa}. The cron will sign tx that the contract rejects as NotSettler. Rotate settler via proposeSettler/acceptSettler OR update SETTLER_PRIVATE_KEY.`,
    };
  } catch (err) {
    checks.settlerOnchainMatch = {
      ok: false,
      detail: `contract read failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // 4. Contract's USDC matches our configured token contract.
  try {
    const onchainUsdc = (await client.readContract({
      address: cfg.contractAddress,
      abi: SETTLER_ABI,
      functionName: "USDC",
    })) as Address;
    const match = onchainUsdc.toLowerCase() === cfg.tokenContract.toLowerCase();
    checks.tokenContractMatch = {
      ok: match,
      detail: match
        ? `on-chain USDC=${onchainUsdc} == configured token`
        : `MISMATCH: contract.USDC()=${onchainUsdc} but PRIZE_POOL_TOKEN_CONTRACT=${cfg.tokenContract}. Pool balance reads will be wrong.`,
    };
  } catch (err) {
    checks.tokenContractMatch = {
      ok: false,
      detail: `contract read failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // 5. Settler EOA gas balance. ≥ 0.01 ETH on Base is roughly 50+
  //    distribute() calls of headroom; below that we page.
  try {
    const gasWei = await client.getBalance({ address: settlerEoa });
    const gasEth = formatEther(gasWei);
    const ok = gasWei >= 10_000_000_000_000_000n; // 0.01 ETH
    checks.settlerGas = {
      ok,
      detail: `settler EOA balance=${gasEth} ETH (${ok ? "≥" : "<"} 0.01 ETH threshold)`,
    };
  } catch (err) {
    checks.settlerGas = {
      ok: false,
      detail: `balance read failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // 6. Pool USDC balance — informational, not a failure (a $0 pool on
  //    day 1 is expected).
  try {
    const usdc = await readPoolUsdcBalance();
    checks.poolUsdcBalance = {
      ok: true,
      detail: `pool USDC=${usdc}`,
    };
  } catch (err) {
    checks.poolUsdcBalance = {
      ok: false,
      detail: `pool balance read failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // 7. ADMIN_ALERT_EMAIL configured? `sendOpsAlert` silently no-ops
  //    without it, which means every wired alert path is dead in prod.
  const alertEmail = process.env.ADMIN_ALERT_EMAIL;
  checks.adminAlertEmail = {
    ok: !!alertEmail,
    detail: alertEmail
      ? `set=${alertEmail}`
      : "ADMIN_ALERT_EMAIL not set — every sendOpsAlert call will silently no-op. Set in Vercel before the next 1st-of-month.",
  };

  const allOk = Object.values(checks).every((c) => c.ok);
  return NextResponse.json({ ok: allOk, checks }, { status: 200 });
}
