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
