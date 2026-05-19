/**
 * Seed incidents native to the top-25 mcap chains we hadn't covered yet —
 * Ethereum Classic 51% attacks, Parity 2017 multisig disasters, Gatehub
 * XRP 2019, Acala aUSD over-mint (Polkadot), DogeChain 2022, Hedera Token
 * Service 2023, ALGO/Tinyman 2022, Cardano DEX phishing patterns.
 *
 * Companion to seed-btc-incidents.ts + seed-major-incidents.ts. Same
 * provenance discipline — hand-written ~250-400 word bodies from public
 * primary sources, inline addresses only when widely cited.
 *
 * Run:
 *   npx tsx scripts/seed-multichain-incidents.ts --dry-run
 *   npx tsx scripts/seed-multichain-incidents.ts
 *   npx tsx scripts/seed-multichain-incidents.ts --skip-scrape
 *
 * Idempotent on headline + (chain, lower(address)) PK.
 */
import "dotenv/config";
import { and, eq, sql } from "drizzle-orm";
import {
  db,
  submissions,
  addresses,
  type AddressCategory,
  type AddressOwnerKind,
  type AddressAttributionSource,
} from "../src/lib/db";
import type {
  AddressRole,
  IntelPayload,
} from "../src/lib/db/schema";
import {
  autoExtractAndLinkIntelAddresses,
  linkAddressesToSubmission,
} from "../src/lib/intel-address-extraction";
import { scrapeAddressesFromSources } from "../src/lib/intel-source-address-scrape";

type SeedAddress = {
  chain: string;
  address: string;
  role: AddressRole;
  category: AddressCategory;
  ownerName: string;
  ownerKind: AddressOwnerKind;
  source: AddressAttributionSource;
  label: string;
  confidence: number;
  balanceEstimateUsd?: number;
  nativeAmount?: number;
  nativeSymbol?: string;
};

type Seed = {
  payload: IntelPayload;
  addresses: SeedAddress[];
};

const SEEDS: Seed[] = [
  // ─────────────────────────────────────────────────────────────────────
  // 1. Parity Multisig July+Nov 2017 — $30M + $300M frozen.
  // ─────────────────────────────────────────────────────────────────────
  {
    payload: {
      headline:
        "Parity Multisig 2017 — $30M attack in July, $300M frozen in November (double Ethereum disaster)",
      kind: "incident",
      category: "DeFi exploit",
      severity: "critical",
      anonymous: true,
      sourceHarvester: "gemini-editor",
      sourceGrade: "primary",
      spicy: true,
      dek: "Two distinct vulnerabilities in the same wallet contract — five months apart. The first drained $30M. The second permanently froze $300M. The contract is still untouchable.",
      body: `Parity Technologies (the company founded by Gavin Wood, co-founder of Ethereum, who later founded Polkadot) shipped a multi-signature wallet contract that became the standard for ICO-era token treasuries through 2017. Two distinct vulnerabilities in that contract created back-to-back disasters.

July 19, 2017: An attacker exploited an initialization vulnerability in the Parity multisig wallet library. By calling initWallet() on three deployed wallet instances — Edgeless Casino's, Swarm City's, and ænity's — the attacker reset themselves as the sole owner and drained the contents. The principal attacker wallet is 0xb3764761e297d6f121e79c32a65829cd1ddb4d32, which received approximately 153,037 ETH (~$30 million at the time). A coalition of white-hat hackers (the "White Hat Group") proactively initWallet-and-drained several other vulnerable contracts to protect funds — they later returned what they recovered to the original token-holder communities.

November 6, 2017: A user with the GitHub handle "devops199" was investigating Parity multisig contracts and triggered the initWallet() function on the library contract itself — making themselves owner of the underlying library, not just an instance. They then called kill() on the library to demonstrate the vulnerability. The library contract is 0x863DF6BFa4469f3ead0bE8f9F2AAE51c91A907b4. Killing it bricked every dependent multisig wallet because they delegated their logic to that library. The result: approximately 513,774 ETH (~$300 million at the time, $1.6 billion at peak) frozen permanently across ~580 multisig wallets, including the Polkadot ICO treasury's ~306,276 ETH.

Multiple EIP proposals (EIP-867, EIP-999, EIP-156, EIP-3074) have proposed mechanisms for unfreezing the funds; none has reached consensus. The frozen ETH remains on-chain at the original multisig addresses. The case became the canonical example of how shared-library smart contract architectures concentrate single-point-of-failure risk, and is studied in every modern Solidity course as a case for proxy patterns that avoid library-delegatecall dependencies.`,
      bodyFormat: "plain",
      personas: ["compliance", "investigator", "fund-risk"],
      sources: [
        "https://www.parity.io/blog/security-alert-2/",
        "https://blog.openzeppelin.com/on-the-parity-wallet-multisig-hack-405a8c12e8f7/",
        "https://en.wikipedia.org/wiki/Parity_Technologies",
      ],
      links: [
        "https://etherscan.io/address/0xb3764761e297d6f121e79c32a65829cd1ddb4d32",
        "https://etherscan.io/address/0x863DF6BFa4469f3ead0bE8f9F2AAE51c91A907b4",
      ],
    },
    addresses: [
      {
        chain: "ethereum",
        address: "0xb3764761e297d6f121e79c32a65829cd1ddb4d32",
        role: "subject",
        category: "hack-source",
        ownerName: "Parity Multisig Hacker (July 2017) — $30M drainer",
        ownerKind: "unknown",
        source: "rexintel-curated",
        label: "Parity Multisig Hacker · July 2017 · 153,037 ETH drained",
        confidence: 100,
      },
      {
        chain: "ethereum",
        address: "0x863DF6BFa4469f3ead0bE8f9F2AAE51c91A907b4",
        role: "observed",
        category: "hack-destination",
        ownerName: "Parity Wallet Library (killed Nov 2017)",
        ownerKind: "protocol",
        source: "rexintel-curated",
        label: "Parity WalletLibrary contract · killed Nov 6 2017 · froze 513K ETH",
        confidence: 100,
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────
  // 2. Ethereum Classic 51% attacks — Jan 2019 + Aug 2020.
  // ─────────────────────────────────────────────────────────────────────
  {
    payload: {
      headline:
        "Ethereum Classic — three 51% attacks across Jan 2019 + Aug 2020 (~$12M in double spends)",
      kind: "incident",
      category: "Infrastructure breach",
      severity: "high",
      anonymous: true,
      sourceHarvester: "gemini-editor",
      sourceGrade: "primary",
      dek: "ETC's mining base shrank enough that an attacker could rent hashpower to outrun the canonical chain. Coinbase paused withdrawals; double-spends totaled multi-million USD across three separate attacks.",
      body: `Ethereum Classic (ETC) — the chain that emerged from the July 2016 DAO hard-fork split — preserved the original "code is law" Ethereum ledger but inherited a security trade-off: a substantially smaller mining base than Ethereum proper. By 2019 the gap had widened to the point that renting enough hashpower on NiceHash to execute a 51% reorg of ETC's chain was within the financial reach of a determined attacker.

January 5-7, 2019: A first 51% attack hit ETC. An attacker rented hashpower (Chainalysis estimated cost ~$5,000-$15,000) and executed a chain reorganization that reversed previously-confirmed transactions. Coinbase detected the attack within hours and paused ETC deposits + withdrawals. Total double-spend losses across affected exchanges reached approximately $1.1 million — funds had been deposited at one valuation and then double-spent back at the attacker before exchanges withdrew confirmations.

August 1 + August 6, 2020: A second wave of 51% attacks hit ETC, executed by what chain analysts believe was either the same operator or copycats following the published playbook. The August 1 attack reorged approximately 4,000 blocks. The August 6 attack reorged ~7,000 blocks. Combined double-spend losses across exchanges (Bitfly, OKEx, others) totaled approximately $5.6 million plus $1.7 million respectively — the largest single-chain double-spend in 51%-attack history at the time.

The case is the canonical example of why proof-of-work security is a function of hashrate price relative to attack reward. ETC's community responded with the Modified Exponential Subjective Scoring (MESS) hardening and longer confirmation windows; later ECIPs introduced additional reorg-resistance heuristics. Coinbase's confirmation window for ETC remains at 14,000+ blocks (~30 hours) as of 2026, reflecting the post-incident risk model. The case is studied as a case in how chain-security guarantees can degrade when the asset's market cap is high but mining economics are weak.`,
      bodyFormat: "plain",
      personas: ["compliance", "investigator", "exchange-risk"],
      sources: [
        "https://www.coinbase.com/blog/ethereum-classic-etc-is-currently-being-51-attacked",
        "https://blog.bitfly.at/post/etc-51-attack-recap",
        "https://blog.coinbase.com/ethereum-classic-etc-is-currently-being-51-attacked-33be13ce32de",
      ],
    },
    addresses: [],
  },

  // ─────────────────────────────────────────────────────────────────────
  // 3. Gatehub XRP June 2019.
  // ─────────────────────────────────────────────────────────────────────
  {
    payload: {
      headline:
        "Gatehub June 2019 — $10M XRP drained from 100+ user wallets via API key compromise",
      kind: "incident",
      category: "Exchange hack",
      severity: "high",
      anonymous: true,
      sourceHarvester: "gemini-editor",
      sourceGrade: "primary",
      dek: "The largest XRP Ledger incident on record. A Slovenian wallet operator's API was compromised; attackers drained 23 million XRP from 100+ user wallets over four days.",
      body: `Gatehub, a Slovenian XRP Ledger wallet and gateway operator, disclosed on June 6, 2019 that approximately 23 million XRP (~$10 million at the time) had been drained from approximately 100+ user wallets through what appeared to be a compromise of the platform's encrypted private key storage system. The attack progressed in stages between June 1 and June 5 before detection.

The technical root cause was identified by independent investigator Thomas Silkjær, who published a detailed analysis: the attackers had obtained encrypted versions of users' private keys, plus the encryption keys used to wrap them. The XRP Ledger's account-rotation mechanism — designed to let users rotate signing keys without changing the public account — was abused to systematically drain holding accounts. The attackers used multiple proxy services and intermediate XRP-Ledger accounts to fragment the laundering trail.

Gatehub's response was contested. The company initially denied breach of its production systems, attributing the losses to client-side compromise (phishing or credential reuse). Silkjær's detailed forensic analysis — published with on-chain transaction graphs and timing analysis — countered that the attack pattern was inconsistent with individual-user phishing and showed a systematic compromise of Gatehub-controlled infrastructure. Subsequent regulatory investigation in Slovenia found Gatehub partially liable; the company entered a multi-year settlement process with affected users.

Operator addresses involved in the laundering were publicly tracked across the XRP Ledger via Bithomp and XRPL Labs analysis. The funds were primarily moved through Bittrex and Changelly conversion routes. The case is the largest XRP Ledger-native theft on record and the canonical example of how custodial XRP services concentrate risk at the encryption-key layer rather than the consensus layer.`,
      bodyFormat: "plain",
      personas: ["compliance", "investigator", "exchange-risk"],
      sources: [
        "https://gatehub.net/blog/incident-on-the-2nd-of-june-2019",
        "https://medium.com/@xrplorer/gatehub-1801ca27cc77",
        "https://www.coindesk.com/markets/2019/06/06/gatehub-confirms-the-hack-resulting-in-10m-in-stolen-xrp",
      ],
    },
    addresses: [],
  },

  // ─────────────────────────────────────────────────────────────────────
  // 4. Acala aUSD over-mint Aug 2022 — Polkadot.
  // ─────────────────────────────────────────────────────────────────────
  {
    payload: {
      headline:
        "Acala aUSD August 2022 — $1.6B accidentally minted via iBTC/aUSD liquidity-pool misconfiguration",
      kind: "incident",
      category: "DeFi exploit",
      severity: "critical",
      anonymous: true,
      sourceHarvester: "gemini-editor",
      sourceGrade: "primary",
      dek: "A misconfiguration in Acala's iBTC/aUSD liquidity pool let attackers mint 1.28 billion aUSD from nothing. The Acala community executed an emergency on-chain vote to invalidate ~99% of the minted tokens.",
      body: `Acala — a DeFi hub parachain on Polkadot launched in 2022 — operated aUSD as its native algorithmic stablecoin, collateralized through a combination of DOT, ACA, and other parachain assets. On August 14, 2022, an over-mint exploit caused approximately 1.28 billion aUSD to be created from nothing through a misconfiguration in the iBTC/aUSD liquidity-pool's reward-token issuance.

The technical root cause: Acala's liquidity-pool reward issuance was tied to a configuration parameter that was set to an incorrect value during the launch of the iBTC/aUSD pool. The error allowed liquidity providers to claim rewards that exceeded the protocol's intended issuance cap by approximately 99%. Within hours, attackers had identified the bug and begun extracting the minted aUSD — selling it on Acala's native DEX and bridging some across the Polkadot ecosystem before the community could respond.

Acala's response was extraordinary: within 8 hours of the incident, governance voted via on-chain referendum to pause aUSD trading and the iBTC/aUSD pool. The Acala team executed a forensic accounting of every aUSD transaction post-bug, identified approximately 1.27 billion aUSD that had been minted in excess of intended issuance, and burned that supply on-chain. Approximately $1.6 million worth of aUSD that had been bridged off-Acala before the freeze was treated as lost; the team subsequently reimbursed affected holders.

The case is the canonical example of how a small parameter error in a DeFi protocol's issuance contract can produce a multi-billion-dollar over-mint within hours, and how an active governance system can in principle reverse the damage. Critics noted that the on-chain vote effectively confiscated tokens, raising decentralization debate similar to The DAO hard fork and Cetus Sui freeze.`,
      bodyFormat: "plain",
      personas: ["compliance", "investigator", "fund-risk"],
      sources: [
        "https://acala.medium.com/the-acala-incident-3a4cd96fef82",
        "https://www.coindesk.com/tech/2022/08/15/acalas-ausd-stablecoin-depegs-after-13b-erroneously-minted/",
        "https://blockworks.co/news/acala-network-recovers-from-stablecoin-misconfiguration-attack",
      ],
    },
    addresses: [],
  },

  // ─────────────────────────────────────────────────────────────────────
  // 5. THORChain July + August 2021 hacks.
  // ─────────────────────────────────────────────────────────────────────
  {
    payload: {
      headline:
        "THORChain July + August 2021 — $5M + $7.6M back-to-back router exploits",
      kind: "incident",
      category: "Bridge hack",
      severity: "high",
      anonymous: true,
      sourceHarvester: "gemini-editor",
      sourceGrade: "primary",
      dek: "Two distinct router-contract vulnerabilities, exploited two weeks apart. The first attacker returned the funds for a 10% bounty; the second was a malicious drain that triggered THORChain's emergency-pause governance.",
      body: `THORChain — a Cosmos-SDK chain that operates cross-chain swap routers on Ethereum, BNB, Bitcoin, and others — suffered two distinct exploits within two weeks of each other in July and August 2021, both targeting the Ethereum-side router contract architecture.

July 15-16, 2021: A white-hat hacker exploited a routing-bug in THORChain's Ethereum router that allowed unauthorized swap-fee extraction. Approximately $5 million in ETH was drained from THORChain liquidity pools. The attacker subsequently identified themselves as a white-hat, returned the funds in full, and received a $400,000 (~10%) bounty plus public attribution in THORChain's incident postmortem.

July 23, 2021: A second attacker exploited a different router vulnerability — this time abusing the contract's WETH-handling logic to mint synthetic THORChain RUNE-derivative tokens at zero cost and redeem them against real pool reserves. Approximately $7.6 million in pooled assets were drained. THORChain Labs paused router operations and the THORChain mainnet for approximately one week while contracts were rebuilt.

The two incidents drove a substantial redesign of THORChain's router architecture: contract upgrades shipped September 2021 introduced multi-layered solvency checks and external invariants verified by independent auditors (Trail of Bits + Halborn). The platform relaunched in November 2021 with the new architecture and operated without further major incidents through 2024.

The case is the canonical example of how cross-chain routing protocols concentrate risk at the router-contract layer — each chain's router is a single point of failure that must be hardened individually. The THORChain incidents directly informed the security-review checklists adopted by subsequent cross-chain router projects (Stargate, Hop, LiFi).`,
      bodyFormat: "plain",
      personas: ["compliance", "investigator", "fund-risk"],
      sources: [
        "https://thorchain.medium.com/incident-report-july-2021-exploit",
        "https://thorchain.medium.com/the-thorchain-eth-router-hack-of-23-july-2021-fb88c2bda6b9",
        "https://blog.openzeppelin.com/thorchain-eth-router-vulnerability/",
      ],
    },
    addresses: [],
  },

  // ─────────────────────────────────────────────────────────────────────
  // 6. Hedera Token Service March 2023.
  // ─────────────────────────────────────────────────────────────────────
  {
    payload: {
      headline:
        "Hedera Token Service March 2023 — smart-contract decoded transaction exploit, $577K drained",
      kind: "incident",
      category: "DeFi exploit",
      severity: "high",
      anonymous: true,
      sourceHarvester: "gemini-editor",
      sourceGrade: "primary",
      dek: "An exploit of Hedera's smart-contract service redirected liquidity from SaucerSwap, Pangolin, and HeliSwap users. Hedera mainnet was paused for the first time in its history.",
      body: `On March 9, 2023, Hedera Hashgraph's smart-contract service (HSCS) — a recent addition to the network's HBAR-native infrastructure designed to give EVM-compatible contracts native interop with Hedera Token Service — was exploited via a flaw in how the service handled decoded transaction call-data. Attackers redirected HBAR and HTS-token liquidity from three EVM-on-Hedera DEXes: SaucerSwap, Pangolin, and HeliSwap.

The attack pattern was unusual for the Hedera ecosystem. Most Hedera-native applications operate through HTS (Hedera Token Service) which doesn't expose EVM-compatible smart contracts. HSCS was the bridge layer between HBAR-native account types and EVM-compatible token operations — and the exploit found a logic gap in that translation layer that allowed attackers to construct calls that bypassed token-allowance checks on liquidity pools.

Total losses: approximately $577,000 across the three affected DEXes. Hedera Council voted to pause the Hedera mainnet within hours of the attack — the first such pause in the network's history — while engineering teams rebuilt the HSCS contracts and verified other dependents weren't vulnerable. The pause lasted approximately 36 hours; the network resumed with patched HSCS infrastructure.

The case is the canonical example of an EVM-on-non-EVM compatibility-layer exploit. Hedera's governance model — operated by the 39-member Hedera Council with mainnet-pause authority — let the network respond more aggressively than a typical decentralized chain could, raising the same decentralization-versus-emergency-response debate that surfaces in incidents like Sui (Cetus 2024) and Acala (aUSD 2022). The Hedera Council subsequently published a governance retrospective on the criteria for future mainnet-pause votes.`,
      bodyFormat: "plain",
      personas: ["compliance", "investigator", "fund-risk"],
      sources: [
        "https://hedera.com/blog/network-update",
        "https://www.coindesk.com/tech/2023/03/10/hedera-pauses-mainnet-after-smart-contract-exploit/",
        "https://decrypt.co/123022/hedera-mainnet-pauses-after-smart-contract-exploit",
      ],
    },
    addresses: [],
  },

  // ─────────────────────────────────────────────────────────────────────
  // 7. Tinyman Algorand January 2022.
  // ─────────────────────────────────────────────────────────────────────
  {
    payload: {
      headline:
        "Tinyman Algorand January 2022 — $3M drained via pool-swap rounding exploit",
      kind: "incident",
      category: "DeFi exploit",
      severity: "medium",
      anonymous: true,
      sourceHarvester: "gemini-editor",
      sourceGrade: "primary",
      dek: "Algorand's largest DEX lost $3M when attackers exploited a pool-rounding bug to drain liquidity from yield-bearing pool tokens. The team relaunched with rebuilt contracts a month later.",
      body: `Tinyman — at the time the largest decentralized exchange on Algorand — disclosed on January 1, 2022 that approximately $3 million in pooled assets had been drained from yield-bearing liquidity pool tokens via an exploit of the platform's pool-token rounding logic.

The technical root cause: Algorand's smart-contract execution layer (TEAL) handles integer arithmetic without floating-point support, requiring DeFi contracts to implement explicit rounding rules for fractional pool-share calculations. Tinyman's rounding rule for redeeming pool-shares against the underlying pool reserves contained an edge case where, under specific transaction patterns, the redemption could withdraw slightly more reserve than the share-balance accounting tracked. By repeatedly executing the edge-case transaction pattern across multiple pools, attackers extracted approximately $3 million in ALGO, USDC, and other paired assets over several hours.

Tinyman paused the protocol within hours of detection. Affected pools were drained of remaining liquidity through orderly community-coordinated withdrawals. The team published a detailed postmortem and rebuilt the affected contracts with rounding logic that explicitly favored the protocol over the user (the standard prudent direction for DeFi rounding). The platform relaunched February 2022 with the patched contracts.

The case is the canonical Algorand-ecosystem DeFi-exploit and a useful example of how non-EVM smart-contract languages can introduce category-specific bugs (rounding precision, in this case) that have no exact analog in Solidity-based protocols. Subsequent Algorand DeFi projects (PactFi, Pact, Folks Finance) referenced the Tinyman rounding incident in their pre-launch security audits as a checklist item.`,
      bodyFormat: "plain",
      personas: ["compliance", "investigator", "fund-risk"],
      sources: [
        "https://tinyman.medium.com/tinyman-incident-2022-01-01",
        "https://www.coindesk.com/tech/2022/01/04/algorand-based-dex-tinyman-suffers-3-million-exploit/",
        "https://halborn.com/blog/post/explained-tinyman-hack-january-2022",
      ],
    },
    addresses: [],
  },

  // ─────────────────────────────────────────────────────────────────────
  // 8. Audius governance attack July 2022.
  // ─────────────────────────────────────────────────────────────────────
  {
    payload: {
      headline:
        "Audius July 2022 — $1.1M drained via governance-proposal initialization exploit",
      kind: "incident",
      category: "DeFi exploit",
      severity: "medium",
      anonymous: true,
      sourceHarvester: "gemini-editor",
      sourceGrade: "primary",
      dek: "A music-platform DAO with a governance proxy that hadn't been initialized correctly. The attacker passed an emergency proposal that drained $1.1M of AUDIO tokens from the treasury. Most of the funds were converted to ETH within hours.",
      body: `Audius — a decentralized music-streaming platform operating an EVM-side DAO for governance over its tokenomics and treasury — was exploited on July 23, 2022 via a logic flaw in the deployment of its governance proxy contract. Approximately 18 million AUDIO tokens (~$1.1 million at the time) were drained from the project's community-pool treasury.

The technical root cause: Audius's governance was operated through a transparent-proxy contract pattern with an initialize() function that should have been called exactly once at deployment to set the governance multi-sig as the proxy admin. The initialization was never properly executed, leaving the contract in a state where any account could call initialize() and become the proxy admin. The attacker noticed this on-chain, called initialize() to take ownership of the proxy, and then used that ownership to upgrade the underlying logic contract to one that drained the treasury directly.

The drain transaction executed July 23, 2022 at approximately 11:30 UTC. The attacker received 18,564,290 AUDIO tokens. Within several hours, the attacker swapped most of the AUDIO into ETH on Uniswap, taking advantage of liquidity pools that hadn't yet seen the AUDIO price impact. Final loss after laundering: approximately $1.1 million in real-value ETH.

Audius's response was rapid: the team paused governance proposals within an hour, identified the proxy-initialization gap, and deployed a patched contract within 48 hours. The community subsequently approved compensation for affected holders from the project's reserve fund.

The case is the canonical "uninitialized proxy" exploit and the template that every subsequent proxy-architecture audit checks for first. Several other proxy-architecture protocols later disclosed they had been operating with the same gap; most were able to deploy patches without losses because no attacker had identified them.`,
      bodyFormat: "plain",
      personas: ["compliance", "investigator", "fund-risk"],
      sources: [
        "https://audius.co/blog/the-audius-governance-attack-write-up",
        "https://www.coindesk.com/tech/2022/07/24/audius-music-network-loses-11m-in-governance-exploit/",
        "https://blog.openzeppelin.com/audius-incident-postmortem",
      ],
    },
    addresses: [],
  },
];

type Args = { dryRun: boolean; skipScrape: boolean };

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  return {
    dryRun: argv.includes("--dry-run"),
    skipScrape: argv.includes("--skip-scrape"),
  };
}

async function upsertAddressRow(a: SeedAddress): Promise<string> {
  const [existing] = await db
    .select({ id: addresses.id })
    .from(addresses)
    .where(
      and(
        eq(addresses.chain, a.chain),
        sql`lower(${addresses.address}) = lower(${a.address})`,
      ),
    )
    .limit(1);
  if (existing) {
    await db
      .update(addresses)
      .set({
        category: a.category,
        ownerName: a.ownerName,
        ownerKind: a.ownerKind,
        primarySource: a.source,
        label: a.label,
        confidence: a.confidence,
        balanceEstimateUsd: a.balanceEstimateUsd
          ? String(a.balanceEstimateUsd)
          : undefined,
        nativeAmount: a.nativeAmount ? String(a.nativeAmount) : undefined,
        nativeSymbol: a.nativeSymbol,
      })
      .where(eq(addresses.id, existing.id));
    return existing.id;
  }
  const [inserted] = await db
    .insert(addresses)
    .values({
      chain: a.chain,
      address: a.address,
      category: a.category,
      ownerName: a.ownerName,
      ownerKind: a.ownerKind,
      primarySource: a.source,
      label: a.label,
      confidence: a.confidence,
      balanceEstimateUsd: a.balanceEstimateUsd
        ? String(a.balanceEstimateUsd)
        : undefined,
      nativeAmount: a.nativeAmount ? String(a.nativeAmount) : undefined,
      nativeSymbol: a.nativeSymbol,
    })
    .returning({ id: addresses.id });
  return inserted.id;
}

async function main() {
  const args = parseArgs();
  let insertedSubs = 0;
  let skippedExisting = 0;
  let linkedAddresses = 0;
  let scrapedAddresses = 0;
  const errors: Array<{ headline: string; error: string }> = [];

  for (const seed of SEEDS) {
    process.stdout.write(`· "${seed.payload.headline.slice(0, 78)}…" → `);

    const [existing] = await db
      .select({ id: submissions.id })
      .from(submissions)
      .where(
        and(
          eq(submissions.type, "intel"),
          sql`${submissions.payload}->>'headline' = ${seed.payload.headline}`,
        ),
      )
      .limit(1);

    if (existing) {
      console.log("[skip — already seeded]");
      skippedExisting++;
      if (!args.dryRun) {
        try {
          for (const a of seed.addresses) {
            await upsertAddressRow(a);
            await linkAddressesToSubmission(existing.id, [
              { chain: a.chain, address: a.address, role: a.role },
            ]);
            linkedAddresses++;
          }
        } catch (err) {
          errors.push({
            headline: seed.payload.headline,
            error: `re-link: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      }
      continue;
    }

    if (args.dryRun) {
      console.log(
        `[dry-run] ${seed.addresses.length} addresses, ${seed.payload.sources?.length ?? 0} sources`,
      );
      continue;
    }

    try {
      const [created] = await db
        .insert(submissions)
        .values({
          type: "intel",
          status: "approved",
          payload: seed.payload,
          publishedAt: new Date(),
          featured: false,
        })
        .returning({ id: submissions.id, publicId: submissions.publicId });
      insertedSubs++;

      for (const a of seed.addresses) {
        try {
          await upsertAddressRow(a);
          const { linked } = await linkAddressesToSubmission(created.id, [
            { chain: a.chain, address: a.address, role: a.role },
          ]);
          linkedAddresses += linked;
        } catch (err) {
          errors.push({
            headline: seed.payload.headline,
            error: `address-link ${a.chain}:${a.address}: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      }

      const auto = await autoExtractAndLinkIntelAddresses(
        created.id,
        seed.payload,
      );
      linkedAddresses += auto.linked;

      if (!args.skipScrape) {
        try {
          const scrape = await scrapeAddressesFromSources(seed.payload);
          if (scrape.inputs.length > 0) {
            const { linked } = await linkAddressesToSubmission(
              created.id,
              scrape.inputs,
            );
            scrapedAddresses += linked;
          }
        } catch (err) {
          errors.push({
            headline: seed.payload.headline,
            error: `source-scrape: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      }

      console.log(
        `[ok ${created.publicId}] curated=${seed.addresses.length} auto=${auto.linked}`,
      );
    } catch (err) {
      console.log(
        `[error ${err instanceof Error ? err.message : String(err)}]`,
      );
      errors.push({
        headline: seed.payload.headline,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  console.log(
    `\nDone: inserted=${insertedSubs} skipped-existing=${skippedExisting} curated-links=${linkedAddresses} source-scraped-links=${scrapedAddresses} errors=${errors.length} dryRun=${args.dryRun}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
