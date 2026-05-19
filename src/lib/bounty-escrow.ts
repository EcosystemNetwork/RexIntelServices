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
 * On-chain client for BountyEscrow. Mirrors the surface of
 * prize-pool-onchain.ts:
 *   - read principal / bond / owed
 *   - sign + send awardClaimant / slashBond / awardRefund as the settler
 *
 * Env vars consumed:
 *   BOUNTY_ESCROW_ADDRESS        — BountyEscrow deployed address (0x…). When
 *                                  unset, every read returns null/0n and
 *                                  every settler write throws — the
 *                                  BOUNTY_CUSTODY_RAIL_ENABLED kill switch
 *                                  should keep the create flow off when
 *                                  this is unset.
 *   BOUNTY_ESCROW_TOKEN_CONTRACT — USDC ERC-20 address (defaults to
 *                                  bridged USDC on Base mainnet).
 *   BOUNTY_ESCROW_CHAIN          — "base" (default) | "base-sepolia"
 *   BOUNTY_ESCROW_RPC_URL        — JSON-RPC endpoint
 *   SETTLER_PRIVATE_KEY          — hex-encoded private key for the EOA the
 *                                  contract authorized as settler. Shared
 *                                  with IntelPrizePool by design — one
 *                                  operator key, one ETH balance to top up.
 */

// USDC on Base mainnet (Circle bridged). Mirrors prize-pool-onchain.ts.
const DEFAULT_USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address;

const BOUNTY_ESCROW_ABI = [
  {
    type: "function",
    name: "principal",
    stateMutability: "view",
    inputs: [{ name: "bountyKey", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "bonds",
    stateMutability: "view",
    inputs: [{ name: "claimKey", type: "bytes32" }],
    outputs: [
      { name: "claimant", type: "address" },
      { name: "amount", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "pendingPayout",
    stateMutability: "view",
    inputs: [{ name: "payee", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "settler",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "awardClaimant",
    stateMutability: "nonpayable",
    inputs: [
      { name: "claimKey", type: "bytes32" },
      { name: "bountyKey", type: "bytes32" },
      { name: "payee", type: "address" },
      { name: "payoutAmount", type: "uint256" },
      { name: "refundBondToClaimant", type: "bool" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "slashBond",
    stateMutability: "nonpayable",
    inputs: [{ name: "claimKey", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "awardRefund",
    stateMutability: "nonpayable",
    inputs: [
      { name: "bountyKey", type: "bytes32" },
      { name: "poster", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

const USDC_DECIMALS = 6;

export type OnchainEscrowConfig = {
  contractAddress: Address | null;
  tokenContract: Address;
  chainId: 8453 | 84532;
  rpcUrl: string;
};

export function getOnchainEscrowConfig(): OnchainEscrowConfig {
  const chainSlug = (process.env.BOUNTY_ESCROW_CHAIN || "base").toLowerCase();
  const chainId: 8453 | 84532 = chainSlug === "base-sepolia" ? 84532 : 8453;
  const rpcUrl =
    process.env.BOUNTY_ESCROW_RPC_URL ||
    process.env.PRIZE_POOL_RPC_URL ||
    (chainId === 84532
      ? "https://sepolia.base.org"
      : "https://mainnet.base.org");
  const contractAddress = parseAddress(
    process.env.BOUNTY_ESCROW_ADDRESS,
    "BOUNTY_ESCROW_ADDRESS",
  );
  const tokenContract =
    parseAddress(
      process.env.BOUNTY_ESCROW_TOKEN_CONTRACT,
      "BOUNTY_ESCROW_TOKEN_CONTRACT",
    ) || DEFAULT_USDC_BASE;
  return { contractAddress, tokenContract, chainId, rpcUrl };
}

function parseAddress(v: string | undefined, envName: string): Address | null {
  if (!v) return null;
  const trimmed = v.trim();
  if (!trimmed) return null;
  if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
    throw new Error(
      `${envName}: malformed address '${trimmed}', expected 0x-prefixed 40-hex`,
    );
  }
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

/**
 * Pack a UUID into bytes32 for use as a bountyKey or claimKey. UUIDs are 16
 * bytes; the contract reads bytes32. We right-align — the UUID lands in the
 * low 16 bytes, giving clean `0x00…00<uuid>` keys that are easy to grep on
 * Basescan.
 */
export function uuidToKey(uuid: string): Hex {
  const stripped = uuid.replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(stripped)) {
    throw new Error(`uuidToKey: malformed uuid "${uuid}"`);
  }
  return `0x${"0".repeat(32)}${stripped}` as Hex;
}

/** Decimal USDC string ("1.23") → 6-decimal bigint (1_230_000n). */
export function parseUsdc(amount: string | number): bigint {
  const s = typeof amount === "number" ? amount.toFixed(USDC_DECIMALS) : amount.trim();
  if (!/^[0-9]+(\.[0-9]+)?$/.test(s)) {
    throw new Error(`parseUsdc: invalid amount "${amount}"`);
  }
  return parseUnits(s, USDC_DECIMALS);
}

/** bigint USDC → human "1.23" decimal string. */
export function formatUsdc(amount: bigint): string {
  return viemFormatUnits(amount, USDC_DECIMALS);
}

function publicClient() {
  const cfg = getOnchainEscrowConfig();
  return createPublicClient({
    chain: getViemChain(cfg.chainId),
    transport: http(cfg.rpcUrl),
  });
}

// ─── Reads ─────────────────────────────────────────────────────────────

export async function readPrincipal(bountyKey: Hex): Promise<bigint> {
  const cfg = getOnchainEscrowConfig();
  if (!cfg.contractAddress) return 0n;
  return (await publicClient().readContract({
    address: cfg.contractAddress,
    abi: BOUNTY_ESCROW_ABI,
    functionName: "principal",
    args: [bountyKey],
  })) as bigint;
}

export type BondRow = {
  claimant: Address;
  amount: bigint;
};

export async function readBond(claimKey: Hex): Promise<BondRow> {
  const cfg = getOnchainEscrowConfig();
  if (!cfg.contractAddress) {
    return { claimant: "0x0000000000000000000000000000000000000000", amount: 0n };
  }
  const [claimant, amount] = (await publicClient().readContract({
    address: cfg.contractAddress,
    abi: BOUNTY_ESCROW_ABI,
    functionName: "bonds",
    args: [claimKey],
  })) as [Address, bigint];
  return { claimant, amount };
}

export async function readPendingPayout(payee: Address): Promise<bigint> {
  const cfg = getOnchainEscrowConfig();
  if (!cfg.contractAddress) return 0n;
  return (await publicClient().readContract({
    address: cfg.contractAddress,
    abi: BOUNTY_ESCROW_ABI,
    functionName: "pendingPayout",
    args: [payee],
  })) as bigint;
}

// ─── Settler writes ────────────────────────────────────────────────────

type SettlerCtx = {
  cfg: OnchainEscrowConfig;
  account: ReturnType<typeof privateKeyToAccount>;
};

async function settlerCtx(): Promise<SettlerCtx> {
  const cfg = getOnchainEscrowConfig();
  if (!cfg.contractAddress) {
    throw new Error("bounty-escrow: BOUNTY_ESCROW_ADDRESS not set");
  }
  const pk = parsePrivateKey(process.env.SETTLER_PRIVATE_KEY);
  if (!pk) {
    throw new Error(
      "bounty-escrow: SETTLER_PRIVATE_KEY missing or malformed (expect 0x-prefixed 32-byte hex)",
    );
  }
  const account = privateKeyToAccount(pk);

  // Sanity: signer must equal on-chain settler. A misconfigured key would
  // burn gas on a reverting tx and silently fail forever.
  const onChain = (await publicClient().readContract({
    address: cfg.contractAddress,
    abi: BOUNTY_ESCROW_ABI,
    functionName: "settler",
  })) as Address;
  if (onChain.toLowerCase() !== account.address.toLowerCase()) {
    throw new Error(
      `bounty-escrow: SETTLER_PRIVATE_KEY address ${account.address} does not match on-chain settler ${onChain}`,
    );
  }
  return { cfg, account };
}

async function sendAndWait(
  txHashPromise: Promise<Hex>,
  label: string,
): Promise<Hex> {
  const txHash = await txHashPromise;
  // 90s timeout is well under the 300s cron maxDuration so callers have
  // headroom to persist the hash before the lambda dies.
  const receipt = await publicClient().waitForTransactionReceipt({
    hash: txHash,
    timeout: 90_000,
  });
  if (receipt.status !== "success") {
    throw new Error(`${label}: tx ${txHash} reverted on-chain (block ${receipt.blockNumber})`);
  }
  return txHash;
}

export async function submitAwardClaimant(args: {
  claimKey: Hex;
  bountyKey: Hex;
  payee: Address;
  payoutAmount: bigint;
  refundBondToClaimant: boolean;
}): Promise<Hex> {
  const { cfg, account } = await settlerCtx();
  const walletClient = createWalletClient({
    account,
    chain: getViemChain(cfg.chainId),
    transport: http(cfg.rpcUrl),
  });
  return sendAndWait(
    walletClient.writeContract({
      address: cfg.contractAddress!,
      abi: BOUNTY_ESCROW_ABI,
      functionName: "awardClaimant",
      args: [
        args.claimKey,
        args.bountyKey,
        args.payee,
        args.payoutAmount,
        args.refundBondToClaimant,
      ],
    }),
    "submitAwardClaimant",
  );
}

export async function submitSlashBond(args: { claimKey: Hex }): Promise<Hex> {
  const { cfg, account } = await settlerCtx();
  const walletClient = createWalletClient({
    account,
    chain: getViemChain(cfg.chainId),
    transport: http(cfg.rpcUrl),
  });
  return sendAndWait(
    walletClient.writeContract({
      address: cfg.contractAddress!,
      abi: BOUNTY_ESCROW_ABI,
      functionName: "slashBond",
      args: [args.claimKey],
    }),
    "submitSlashBond",
  );
}

export async function submitAwardRefund(args: {
  bountyKey: Hex;
  poster: Address;
  amount: bigint;
}): Promise<Hex> {
  const { cfg, account } = await settlerCtx();
  const walletClient = createWalletClient({
    account,
    chain: getViemChain(cfg.chainId),
    transport: http(cfg.rpcUrl),
  });
  return sendAndWait(
    walletClient.writeContract({
      address: cfg.contractAddress!,
      abi: BOUNTY_ESCROW_ABI,
      functionName: "awardRefund",
      args: [args.bountyKey, args.poster, args.amount],
    }),
    "submitAwardRefund",
  );
}
