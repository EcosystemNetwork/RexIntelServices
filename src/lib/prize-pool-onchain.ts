import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits as viemFormatUnits,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";

/**
 * On-chain settler client for IntelPrizePool. Wraps the viem read+write
 * surface the monthly-settlement cron needs:
 *   - readPoolUsdcBalance: live USDC balance of the pool contract
 *   - submitDistribute:    sign + send distribute() from the settler EOA
 *
 * Env vars consumed (shared with prize-pool.ts where it makes sense — one
 * pool address serves both the off-chain balance reader and this signer):
 *   PRIZE_POOL_ADDRESS          — IntelPrizePool deployed address (0x…)
 *   PRIZE_POOL_TOKEN_CONTRACT   — USDC ERC-20 address (defaults to bridged
 *                                 USDC on Base mainnet)
 *   PRIZE_POOL_CHAIN            — "base" (default) | "base-sepolia"
 *   PRIZE_POOL_RPC_URL          — JSON-RPC endpoint
 *   SETTLER_PRIVATE_KEY         — hex-encoded private key for the EOA the
 *                                 contract authorized as settler. Server-
 *                                 only; never logged. A leaked key lets an
 *                                 attacker call distribute() and rescue()
 *                                 of non-USDC tokens — they cannot drain
 *                                 the USDC pool itself.
 *
 * Why a separate file from prize-pool.ts: the cron + admin tools import
 * this to *write*, while almost every other route only *reads* via
 * fetchPoolBalance(). Keeping the signer surface narrow makes it easy to
 * audit which call sites can mutate on-chain state.
 */

// USDC on Base mainnet (Circle bridged). Mirrors the default in prize-pool.ts.
const DEFAULT_USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address;

const INTEL_PRIZE_POOL_ABI = [
  {
    type: "function",
    name: "distribute",
    stateMutability: "nonpayable",
    inputs: [
      { name: "month", type: "uint256" },
      { name: "winners", type: "address[5]" },
      { name: "amounts", type: "uint256[5]" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "distributed",
    stateMutability: "view",
    inputs: [{ name: "month", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
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
  {
    type: "function",
    name: "settler",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

const ERC20_BALANCE_OF_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const USDC_DECIMALS = 6;

export type OnchainPoolConfig = {
  contractAddress: Address | null;
  tokenContract: Address;
  chainId: 8453 | 84532;
  rpcUrl: string;
};

/**
 * Resolve env config for the on-chain settler. Returns null
 * contractAddress when PRIZE_POOL_ADDRESS is unset so callers can
 * gracefully skip on-chain settlement until deploy completes.
 */
export function getOnchainPoolConfig(): OnchainPoolConfig {
  const chainSlug = (process.env.PRIZE_POOL_CHAIN || "base").toLowerCase();
  const chainId: 8453 | 84532 = chainSlug === "base-sepolia" ? 84532 : 8453;
  const rpcUrl =
    process.env.PRIZE_POOL_RPC_URL ||
    (chainId === 84532
      ? "https://sepolia.base.org"
      : "https://mainnet.base.org");
  const contractAddress = parseAddress(process.env.PRIZE_POOL_ADDRESS);
  const tokenContract =
    parseAddress(process.env.PRIZE_POOL_TOKEN_CONTRACT) || DEFAULT_USDC_BASE;
  return {
    contractAddress,
    tokenContract,
    chainId,
    rpcUrl,
  };
}

function parseAddress(v: string | undefined): Address | null {
  if (!v) return null;
  const trimmed = v.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) return null;
  return trimmed as Address;
}

function parsePrivateKey(v: string | undefined): Hex | null {
  if (!v) return null;
  const trimmed = v.trim();
  const withPrefix = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(withPrefix)) return null;
  return withPrefix as Hex;
}

function getViemChain(chainId: 8453 | 84532) {
  return chainId === 84532 ? baseSepolia : base;
}

/** Read pool's USDC balance directly from the token contract. Returned as
 *  a decimal string in USDC units (e.g. "1234.56"). */
export async function readPoolUsdcBalance(): Promise<string> {
  const cfg = getOnchainPoolConfig();
  if (!cfg.contractAddress) return "0";
  const client = createPublicClient({
    chain: getViemChain(cfg.chainId),
    transport: http(cfg.rpcUrl),
  });
  const raw = await client.readContract({
    address: cfg.tokenContract,
    abi: ERC20_BALANCE_OF_ABI,
    functionName: "balanceOf",
    args: [cfg.contractAddress],
  });
  return viemFormatUnits(raw, USDC_DECIMALS);
}

/** Whether a given YYYYMM has already been distribute()'d on-chain. The
 *  off-chain monthly_prizes row alone is not enough — a row could be
 *  inserted before the on-chain call lands (or after a tx fails). */
export async function isMonthDistributedOnchain(monthYYYYMM: number): Promise<boolean> {
  const cfg = getOnchainPoolConfig();
  if (!cfg.contractAddress) return false;
  const client = createPublicClient({
    chain: getViemChain(cfg.chainId),
    transport: http(cfg.rpcUrl),
  });
  return (await client.readContract({
    address: cfg.contractAddress,
    abi: INTEL_PRIZE_POOL_ABI,
    functionName: "distributed",
    args: [BigInt(monthYYYYMM)],
  })) as boolean;
}

export type DistributeWinner = {
  address: Address;
  /** Decimal USDC amount, e.g. "240.00". */
  amount: string;
};

export type DistributeResult =
  | { status: "submitted"; txHash: Hex; monthYYYYMM: number }
  | { status: "already_distributed"; monthYYYYMM: number }
  | { status: "skipped_no_contract"; monthYYYYMM: number }
  | { status: "skipped_no_winners"; monthYYYYMM: number };

/**
 * Encode + sign + send distribute() for `monthYYYYMM`. Pads to 5 slots —
 * any missing winner is encoded as (address(0), 0) which the contract
 * silently skips. The submitted tx is awaited until inclusion (status 1)
 * so the caller can persist the hash before returning.
 *
 * Idempotent against on-chain state: pre-flight check against the
 * `distributed` mapping prevents double-submission. The contract itself
 * also reverts with AlreadyDistributed on a race, so the worst case is a
 * wasted gas spend not a double payout.
 */
export async function submitDistribute(args: {
  monthYYYYMM: number;
  winners: DistributeWinner[];
}): Promise<DistributeResult> {
  const cfg = getOnchainPoolConfig();
  if (!cfg.contractAddress) {
    return { status: "skipped_no_contract", monthYYYYMM: args.monthYYYYMM };
  }
  if (!isValidYYYYMM(args.monthYYYYMM)) {
    throw new Error(`submitDistribute: invalid YYYYMM ${args.monthYYYYMM}`);
  }
  const pk = parsePrivateKey(process.env.SETTLER_PRIVATE_KEY);
  if (!pk) {
    throw new Error(
      "submitDistribute: SETTLER_PRIVATE_KEY missing or malformed (expect 0x-prefixed 32-byte hex)",
    );
  }

  // Filter to non-zero amount + non-zero address winners. The contract
  // ignores zero-address / zero-amount slots, but trimming up-front
  // keeps the totalPayable check meaningful client-side.
  const validWinners = args.winners.filter(
    (w) => w.address !== "0x0000000000000000000000000000000000000000" && parseUsdc(w.amount) > 0n,
  );
  if (validWinners.length === 0) {
    return { status: "skipped_no_winners", monthYYYYMM: args.monthYYYYMM };
  }
  if (validWinners.length > 5) {
    throw new Error(
      `submitDistribute: got ${validWinners.length} winners, contract only accepts 5`,
    );
  }

  const account = privateKeyToAccount(pk);
  const chain = getViemChain(cfg.chainId);
  const publicClient = createPublicClient({ chain, transport: http(cfg.rpcUrl) });

  // Pre-flight: bail if the month is already distributed on-chain. Saves
  // gas + lets the caller surface a clean "already_distributed" status.
  const already = (await publicClient.readContract({
    address: cfg.contractAddress,
    abi: INTEL_PRIZE_POOL_ABI,
    functionName: "distributed",
    args: [BigInt(args.monthYYYYMM)],
  })) as boolean;
  if (already) {
    return { status: "already_distributed", monthYYYYMM: args.monthYYYYMM };
  }

  // Sanity: settler() must equal our signer. A misconfigured private key
  // would burn gas on a reverting tx and silently fail the cron forever.
  const settlerOnChain = (await publicClient.readContract({
    address: cfg.contractAddress,
    abi: INTEL_PRIZE_POOL_ABI,
    functionName: "settler",
  })) as Address;
  if (settlerOnChain.toLowerCase() !== account.address.toLowerCase()) {
    throw new Error(
      `submitDistribute: SETTLER_PRIVATE_KEY address ${account.address} does not match on-chain settler ${settlerOnChain}`,
    );
  }

  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(cfg.rpcUrl),
  });

  const winnerSlots: Address[] = [
    "0x0000000000000000000000000000000000000000",
    "0x0000000000000000000000000000000000000000",
    "0x0000000000000000000000000000000000000000",
    "0x0000000000000000000000000000000000000000",
    "0x0000000000000000000000000000000000000000",
  ];
  const amountSlots: bigint[] = [0n, 0n, 0n, 0n, 0n];
  for (let i = 0; i < validWinners.length; i += 1) {
    winnerSlots[i] = validWinners[i].address;
    amountSlots[i] = parseUsdc(validWinners[i].amount);
  }

  const txHash = await walletClient.writeContract({
    address: cfg.contractAddress,
    abi: INTEL_PRIZE_POOL_ABI,
    functionName: "distribute",
    args: [
      BigInt(args.monthYYYYMM),
      winnerSlots as unknown as readonly [Address, Address, Address, Address, Address],
      amountSlots as unknown as readonly [bigint, bigint, bigint, bigint, bigint],
    ],
  });

  // Wait for inclusion so we don't write a "submitted" status to the DB
  // and then have the tx revert silently. A revert here propagates to the
  // cron, which leaves the DB row's payouts entries without a txHash so a
  // re-run can retry.
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
    timeout: 120_000,
  });
  if (receipt.status !== "success") {
    throw new Error(
      `submitDistribute: tx ${txHash} reverted on-chain (block ${receipt.blockNumber})`,
    );
  }

  return { status: "submitted", txHash, monthYYYYMM: args.monthYYYYMM };
}

function parseUsdc(amount: string): bigint {
  if (!/^[0-9]+(\.[0-9]+)?$/.test(amount.trim())) {
    throw new Error(`parseUsdc: invalid amount "${amount}"`);
  }
  return parseUnits(amount.trim(), USDC_DECIMALS);
}

function isValidYYYYMM(n: number): boolean {
  if (!Number.isInteger(n)) return false;
  if (n < 202000 || n > 210000) return false;
  const m = n % 100;
  return m >= 1 && m <= 12;
}

/** YYYY-MM ("2026-05") → 202605. Mirrors the contract's month encoding. */
export function yearMonthToYYYYMM(yearMonth: string): number {
  const m = /^(\d{4})-(\d{2})$/.exec(yearMonth);
  if (!m) throw new Error(`yearMonthToYYYYMM: bad input "${yearMonth}"`);
  return Number(m[1]) * 100 + Number(m[2]);
}
