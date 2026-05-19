// Chain allow-list shared by the public submission form (client) and the
// /api/submit validator (server). Free text in the DB so we can add new
// chains here without a migration; the allow-list keeps junk out of the
// addresses table's unique index.

export const SUPPORTED_CHAINS = [
  { slug: "ethereum", label: "Ethereum" },
  { slug: "bitcoin", label: "Bitcoin" },
  { slug: "solana", label: "Solana" },
  { slug: "tron", label: "Tron" },
  { slug: "bsc", label: "BNB Smart Chain" },
  { slug: "polygon", label: "Polygon" },
  { slug: "arbitrum", label: "Arbitrum" },
  { slug: "optimism", label: "Optimism" },
  { slug: "base", label: "Base" },
  { slug: "avalanche", label: "Avalanche" },
  { slug: "ton", label: "TON" },
  { slug: "near", label: "NEAR" },
  { slug: "sui", label: "Sui" },
  { slug: "aptos", label: "Aptos" },
  { slug: "cosmos", label: "Cosmos" },
  { slug: "ripple", label: "XRP Ledger" },
  { slug: "litecoin", label: "Litecoin" },
  { slug: "monero", label: "Monero" },
  { slug: "casper", label: "Casper" },
  { slug: "other", label: "Other" },
] as const;

export type ChainSlug = (typeof SUPPORTED_CHAINS)[number]["slug"];

export const CHAIN_SLUG_SET = new Set<string>(
  SUPPORTED_CHAINS.map((c) => c.slug),
);

export const ADDRESS_ROLES = [
  { slug: "subject", label: "Subject (the actor)" },
  { slug: "counterparty", label: "Counterparty (related)" },
  { slug: "observed", label: "Observed (mentioned)" },
] as const;

export type AddressRoleSlug = (typeof ADDRESS_ROLES)[number]["slug"];

/**
 * Best-effort block-explorer URL for a given chain + address. Returns null
 * for chains we don't have a canonical explorer for, in which case the UI
 * renders the address as text (no link).
 */
export function explorerUrl(chain: string, address: string): string | null {
  switch (chain) {
    case "ethereum":
      return `https://etherscan.io/address/${address}`;
    case "bitcoin":
      return `https://mempool.space/address/${address}`;
    case "solana":
      return `https://solscan.io/account/${address}`;
    case "tron":
      return `https://tronscan.org/#/address/${address}`;
    case "bsc":
      return `https://bscscan.com/address/${address}`;
    case "polygon":
      return `https://polygonscan.com/address/${address}`;
    case "arbitrum":
      return `https://arbiscan.io/address/${address}`;
    case "optimism":
      return `https://optimistic.etherscan.io/address/${address}`;
    case "base":
      return `https://basescan.org/address/${address}`;
    case "avalanche":
      return `https://snowtrace.io/address/${address}`;
    case "ton":
      return `https://tonscan.org/address/${address}`;
    case "near":
      return `https://nearblocks.io/address/${address}`;
    case "sui":
      return `https://suiscan.xyz/mainnet/account/${address}`;
    case "aptos":
      return `https://explorer.aptoslabs.com/account/${address}`;
    case "ripple":
      return `https://xrpscan.com/account/${address}`;
    case "litecoin":
      return `https://litecoinspace.org/address/${address}`;
    case "casper":
      return `https://cspr.live/account/${address}`;
    default:
      return null;
  }
}

/**
 * Best-effort block-explorer URL for a transaction hash on the given chain.
 * Mirrors `explorerUrl` but for tx pages. Returns null for chains without a
 * known tx explorer path.
 */
export function txExplorerUrl(chain: string, txHash: string): string | null {
  switch (chain) {
    case "ethereum":
      return `https://etherscan.io/tx/${txHash}`;
    case "bitcoin":
      return `https://mempool.space/tx/${txHash}`;
    case "solana":
      return `https://solscan.io/tx/${txHash}`;
    case "tron":
      return `https://tronscan.org/#/transaction/${txHash}`;
    case "bsc":
      return `https://bscscan.com/tx/${txHash}`;
    case "polygon":
      return `https://polygonscan.com/tx/${txHash}`;
    case "arbitrum":
      return `https://arbiscan.io/tx/${txHash}`;
    case "optimism":
      return `https://optimistic.etherscan.io/tx/${txHash}`;
    case "base":
      return `https://basescan.org/tx/${txHash}`;
    case "avalanche":
      return `https://snowtrace.io/tx/${txHash}`;
    case "ton":
      return `https://tonscan.org/tx/${txHash}`;
    case "near":
      return `https://nearblocks.io/txns/${txHash}`;
    case "sui":
      return `https://suiscan.xyz/mainnet/tx/${txHash}`;
    case "aptos":
      return `https://explorer.aptoslabs.com/txn/${txHash}`;
    case "ripple":
      return `https://xrpscan.com/tx/${txHash}`;
    case "litecoin":
      return `https://litecoinspace.org/tx/${txHash}`;
    case "casper":
      return `https://cspr.live/deploy/${txHash}`;
    default:
      return null;
  }
}

/** Display label for a chain slug, falling back to the slug capitalized. */
export function chainLabel(slug: string): string {
  const c = SUPPORTED_CHAINS.find((x) => x.slug === slug);
  if (c) return c.label;
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}
