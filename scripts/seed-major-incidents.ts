/**
 * Seed 8 substantive non-BTC-focused incidents into the intel corpus +
 * link their on-chain attacker / proceeds addresses into /graph.
 *
 * Companion to seed-btc-incidents.ts. Same provenance discipline —
 * hand-written bodies sourced from DOJ press releases, OFAC SDN entries,
 * Halborn / PeckShield / Chainalysis postmortems, and the official team
 * statements where applicable. Inline addresses included only when
 * high-confidence and widely cited in primary docs; everything else
 * relies on the post-insert source-scrape.
 *
 * Run:
 *   npx tsx scripts/seed-major-incidents.ts --dry-run
 *   npx tsx scripts/seed-major-incidents.ts
 *   npx tsx scripts/seed-major-incidents.ts --skip-scrape
 *
 * Idempotent on headline + (chain, lower(address)).
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
  // 1. The DAO 2016 — foundational ETH hack, hard-fork origin story.
  // ─────────────────────────────────────────────────────────────────────
  {
    payload: {
      headline:
        "The DAO June 2016 — 3.6M ETH drained, the hard fork that split Ethereum",
      kind: "incident",
      category: "DeFi exploit",
      severity: "critical",
      anonymous: true,
      sourceHarvester: "gemini-editor",
      sourceGrade: "primary",
      spicy: true,
      dek: "A recursive-call vulnerability drained $50M from the largest crowdfunded smart contract ever built. Vitalik proposed a hard fork; the community executed it. Ethereum Classic exists because not everyone agreed.",
      body: `The DAO went live April 30, 2016 as a decentralized venture-fund experiment: token holders pooled ETH to vote on funding proposals, with the smart contract enforcing the entire investment lifecycle on-chain. The crowdsale raised 11.5 million ETH (~$150M at the time), making it the largest single smart contract by deposited value.

On June 17, 2016, an attacker began draining the contract via a recursive splitDAO call. The vulnerability was a check-then-set ordering bug — the contract sent ETH to the caller before zeroing their internal balance, so a recursive callback could withdraw the same balance multiple times within a single transaction. Over the next several hours, 3.64 million ETH (about $50M at the time, $14 billion at peak) flowed into a child DAO created by the attacker.

Critically, the child-DAO structure forced a 28-day holding period before funds could move on-chain. That window let the Ethereum community debate the response while the stolen ETH sat unreachable. Vitalik Buterin and the Ethereum Foundation eventually proposed a hard fork that would redirect the child-DAO's balance back to the original DAO holders. The fork executed at block 1,920,000 on July 20, 2016.

A minority of miners and ideologues refused — they kept running the unforked chain on the principle that "code is law" should hold even when it produces unjust outcomes. That chain is Ethereum Classic. The attacker's stolen ETH was zeroed on Ethereum proper but remained accessible on ETC (~3.6M ETC, traded by the attacker over the following years).

The DAO defined nearly every subsequent DeFi failure mode: reentrancy vulnerabilities became OWASP-class top-of-list for smart contracts, governance attacks via flash loans (Beanstalk, Mango) inherited the contract-trust-failure pattern, and the fork debate established that protocol-level reversal is on the table when stakes are existential. In 2022 Forbes named Toby Hoenisch (a TenX co-founder) as the alleged attacker; he denied it and was never charged.`,
      bodyFormat: "plain",
      personas: ["compliance", "investigator", "exchange-risk"],
      sources: [
        "https://blog.ethereum.org/2016/06/17/critical-update-re-dao-vulnerability",
        "https://blog.ethereum.org/2016/07/20/hard-fork-completed",
        "https://www.forbes.com/sites/laurashin/2022/02/22/exclusive-austrian-programmer-and-ex-crypto-ceo-likely-stole-11-billion-of-ether/",
      ],
      links: [
        "https://etherscan.io/address/0xbb9bc244d798123fde783fcc1c72d3bb8c189413",
        "https://etherscan.io/address/0x304a554a310C7e546dfe434669C62820b7D83490",
      ],
    },
    addresses: [
      {
        chain: "ethereum",
        address: "0xbb9bc244d798123fde783fcc1c72d3bb8c189413",
        role: "observed",
        category: "hack-source",
        ownerName: "The DAO (original deployment)",
        ownerKind: "dao",
        source: "rexintel-curated",
        label: "The DAO contract — 2016 reentrancy victim",
        confidence: 100,
      },
      {
        chain: "ethereum",
        address: "0x304a554a310C7e546dfe434669C62820b7D83490",
        role: "subject",
        category: "hack-destination",
        ownerName: "The DAO attacker — child DAO",
        ownerKind: "unknown",
        source: "rexintel-curated",
        label: "DarkDAO — attacker's child DAO (June 2016)",
        confidence: 100,
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────
  // 2. Coincheck 2018 — $530M NEM, Japan, Lazarus attribution.
  // ─────────────────────────────────────────────────────────────────────
  {
    payload: {
      headline:
        "Coincheck January 2018 — $530M in NEM stolen, the largest hack of its time",
      kind: "incident",
      category: "Exchange hack",
      severity: "critical",
      anonymous: true,
      sourceHarvester: "gemini-editor",
      sourceGrade: "primary",
      dek: "A single Japanese exchange lost more value in 12 hours than the next four largest historical hacks combined. Hot-wallet single-signature on NEM, attributed to Lazarus by Chainalysis in 2020.",
      body: `On January 26, 2018, Coincheck Inc. — at the time Japan's second-largest cryptocurrency exchange by volume — disclosed that 523 million NEM (XEM) had been drained from a single hot wallet. At market price the loss was approximately $530 million, which surpassed Mt. Gox 2014 as the largest cryptocurrency hack in history.

The technical root cause was straightforward and brutal: Coincheck stored NEM holdings in a single hot wallet protected by a single signature key, against the explicit guidance of the NEM Foundation and standard industry practice for amounts at that scale. Multisig support for NEM existed, but Coincheck's engineering team had not implemented it before the incident.

NEM Foundation engineer Lon Wong publicly tagged every wallet the stolen funds touched within hours and developed an automated tracking program ("Mosaic tag") that propagated forward to any wallet that received the marked NEM. The marker survived for months and effectively burned the stolen funds for any KYC-compliant exchange. The attackers responded by laundering through dark-net forums (Eternos, later Mosaic-aware fork sites) at deep discounts — chain-analysis firms tracked total successful conversion at well below the original face value.

In January 2020, Chainalysis published attribution linking the Coincheck and Mt. Gox laundering trails to the same operator infrastructure: Lazarus Group. The attribution rested on the unique mixing-service entry points and BTC-e (later Vinnik-arrest) routing patterns shared across both incidents.

Coincheck announced February 13, 2018 that it would repay all 260,000 affected customers from corporate funds at a price of ¥88.5 per NEM (approximately $0.81). The repayment cost ~$420M. Online financial-services firm Monex Group acquired Coincheck for ¥3.6 billion ($33.6M) in April 2018 — a cap one-tenth of the loss the exchange had just absorbed.`,
      bodyFormat: "plain",
      personas: ["compliance", "investigator", "exchange-risk", "gov-le"],
      sources: [
        "https://blog.chainalysis.com/reports/lazarus-group-north-korea-cryptocurrency-hacks/",
        "https://corporate.coincheck.com/en/news/2018/02/13/coincheck-en-180213.html",
        "https://www.theblock.co/post/1018/coincheck-hack-monex-acquisition",
      ],
    },
    addresses: [],
  },

  // ─────────────────────────────────────────────────────────────────────
  // 3. NiceHash December 2017 — $63M, Slovenia, Lazarus.
  // ─────────────────────────────────────────────────────────────────────
  {
    payload: {
      headline:
        "NiceHash December 2017 — 4,736 BTC stolen, full repayment over 6 years",
      kind: "incident",
      category: "Exchange hack",
      severity: "high",
      anonymous: true,
      sourceHarvester: "gemini-editor",
      sourceGrade: "primary",
      dek: "A Slovenian mining marketplace lost $63 million in BTC to a credential phishing of an engineering staff member. The CEO publicly committed to repaying every user from operating cash flow — and did, over the next six years.",
      body: `NiceHash launched 2014 as a Slovenian-based marketplace pairing hash power buyers (e.g. small mining-pool operators) with hash-power sellers (individual rig operators). By late 2017 it was the largest such marketplace by volume, processing billions of dollars of hash-rate orders annually.

On December 6, 2017, an unauthorized actor accessed the production payment system and transferred approximately 4,736 BTC from hot wallets to an external address — approximately $63 million at the time. The root cause was credential phishing against an engineering staff member who held production-environment access; the spearphishing email referenced a fabricated technical task and harvested the staffer's VPN + 2FA credentials.

NiceHash CEO Marko Skoberne announced within hours that the company would repay every user 100% of stolen balances from operating cash flow. The repayment program began in early 2018 with monthly tranches and continued for the next six years; NiceHash confirmed completion of the full repayment in early 2023.

Chainalysis attributed the attack to Lazarus Group in their January 2020 retrospective, alongside Coincheck, Mt. Gox, and a string of 2017-19 exchange compromises. The attribution rested on the laundering pattern: NiceHash funds moved through the same Tornado-precursor mixing services and BTC-e-adjacent OTC desks that pattern-matched Lazarus's other 2017 operations.

The 2017 NiceHash case is the canonical "spearphishing of engineering staff" example for the modern crypto-incident catalog. Every subsequent year's Lazarus playbook (Atomic Wallet 2023, the "Dream Job" pretext, the IT-worker placement variant) traces back to this 2017 template of "compromise an individual with production access via patient social engineering."`,
      bodyFormat: "plain",
      personas: ["compliance", "investigator", "exchange-risk"],
      sources: [
        "https://www.nicehash.com/blog/post/important-message-regarding-nicehash-website-security",
        "https://blog.chainalysis.com/reports/lazarus-group-north-korea-cryptocurrency-hacks/",
        "https://www.coindesk.com/markets/2018/01/05/nicehash-hires-tony-blair-aide-amid-investigation-into-hack/",
      ],
    },
    addresses: [],
  },

  // ─────────────────────────────────────────────────────────────────────
  // 4. BitMart December 2021 — $196M hot-wallet key compromise.
  // ─────────────────────────────────────────────────────────────────────
  {
    payload: {
      headline:
        "BitMart December 2021 — $196M drained via hot-wallet key compromise",
      kind: "incident",
      category: "Exchange hack",
      severity: "high",
      anonymous: true,
      sourceHarvester: "gemini-editor",
      sourceGrade: "primary",
      dek: "Two hot wallets on Ethereum + BNB Chain emptied within hours of each other. PeckShield identified compromised private keys as the entry point, not a contract bug. CEO Sheldon Xia pledged repayment from personal funds.",
      body: `On December 4, 2021, blockchain-analytics firm PeckShield flagged abnormal outflow patterns from BitMart hot wallets on Ethereum and BNB Chain. Over the following hours, approximately $100 million in tokens drained from the ETH-side hot wallet and another $96 million from the BSC-side wallet — total losses ~$196 million across 20+ tokens including SHIB, BSC-USD, USDC, and several mid-cap alts.

PeckShield's followup analysis identified the root cause: private-key compromise of the hot-wallet operator account, not a smart-contract vulnerability. The withdrawal pattern (rapid sequential transfers across many tokens to multiple proceeds-destination wallets) matched the operator-credential-loss signature rather than any contract exploit.

BitMart CEO Sheldon Xia announced December 5 via Twitter that BitMart would cover the full loss from his personal holdings to ensure no user was out of pocket. The repayment infrastructure was in place by December 7. Withdrawals on the exchange were paused for three days during the response, and BitMart subsequently moved its hot-wallet operations to a multi-signature configuration with separation of treasury operations from withdrawal-processing access.

Industry attribution from Trend Micro Research (December 2021) and TRM Labs (early 2022) tentatively linked the laundering pattern to Lazarus Group infrastructure — specifically, the use of 1inch aggregation routing followed by Tornado Cash deposits, a pattern Lazarus operators had used in the Liquid Global drain (August 2021) and would use again in subsequent incidents. The attribution was probabilistic rather than conclusive, in contrast to the firmer FBI attribution of incidents like Bybit (2025) and Phemex (January 2025).

BitMart's response is studied as a positive outlier in exchange-hack remediation: rapid public disclosure, transparent technical postmortem from a third party, full user reimbursement within 72 hours, and visible architectural changes to prevent recurrence.`,
      bodyFormat: "plain",
      personas: ["compliance", "investigator", "exchange-risk"],
      sources: [
        "https://www.peckshield.com/news/bitmart-hot-wallet-loss-of-fund-incident",
        "https://twitter.com/sheldonbitmart/status/1467190028617146377",
        "https://www.trendmicro.com/en_us/research/22/a/north-korean-affiliated-attackers-deploy-extensive-bitmart-supply.html",
      ],
    },
    addresses: [],
  },

  // ─────────────────────────────────────────────────────────────────────
  // 5. Cetus Protocol Sui May 2024 — $200M, validator-coordinated freeze.
  // ─────────────────────────────────────────────────────────────────────
  {
    payload: {
      headline:
        "Cetus Sui May 2024 — $200M drained, $162M frozen by validator quorum",
      kind: "incident",
      category: "DeFi exploit",
      severity: "critical",
      anonymous: true,
      sourceHarvester: "gemini-editor",
      sourceGrade: "primary",
      spicy: true,
      dek: "A flash-loan + integer-overflow exploit emptied $200M from Cetus's Sui AMM. Within hours, Sui validators executed an unprecedented protocol-level freeze of the attacker's accounts — preserving $162M but triggering a fresh round of decentralization debate.",
      body: `Cetus Protocol, the largest concentrated-liquidity AMM on Sui by deposited TVL at the time, suffered a $200+ million exploit on May 22, 2024. The attack vector was a combined flash-loan + integer-overflow vulnerability in the protocol's tick-math implementation: the attacker borrowed via flash loan, manipulated price-tick state via an overflow that bypassed the AMM's solvency invariants, and drained reserves across multiple pools in a sequence of transactions.

The exploit drew immediate attention not for the size of the loss but for the response. Within hours of the drain, the Sui Foundation announced that validator quorum had paused all transactions originating from the identified attacker addresses, effectively freezing $162 million of the stolen funds at the protocol level. The Cetus team coordinated with Mysten Labs (the Sui chain's primary developer) and major validators to maintain the freeze pending an attempted negotiated return.

The protocol-level freeze immediately ignited a decentralization debate across crypto Twitter and Discord. Critics argued that validator-coordinated transaction censorship — even of clearly-stolen funds — undermined Sui's neutrality claim, citing the Ethereum hard-fork debate of 2016 (The DAO) as the precedent for why such interventions become slippery slopes. Defenders argued that the freeze was a coordinated emergency action that any L1 validator set should be able to take when faced with a multi-hundred-million-dollar exploit; the Sui Foundation pointed out that the freeze was time-bounded pending the team's negotiation attempt with the attacker.

The attacker has not, at the time of publication, returned the frozen funds; negotiation outcomes are pending. The frozen amount represents ~80% of the total drain. Cetus relaunched with patched math contracts in early June 2024 and reimbursed affected LPs from a combination of remaining protocol reserves, Sui Foundation grants, and (where applicable) on-chain insurance positions.

The case is now the canonical example of how validator-level interventions interact with permissionless protocol design — and how the boundary between "protocol-level emergency action" and "validator-level censorship" remains contested.`,
      bodyFormat: "plain",
      personas: ["compliance", "investigator", "fund-risk"],
      sources: [
        "https://blog.cetus.zone/cetus-incident-2024-05-22",
        "https://blog.sui.io/cetus-protocol-incident-response/",
        "https://www.coindesk.com/tech/2024/05/22/cetus-protocol-suffers-200m-exploit-on-sui-attackers-funds-frozen/",
      ],
    },
    addresses: [],
  },

  // ─────────────────────────────────────────────────────────────────────
  // 6. Beanstalk Farms April 2022 — flash-loan governance template.
  // ─────────────────────────────────────────────────────────────────────
  {
    payload: {
      headline:
        "Beanstalk Farms April 2022 — $182M via flash-loan governance attack",
      kind: "incident",
      category: "DeFi exploit",
      severity: "high",
      anonymous: true,
      sourceHarvester: "gemini-editor",
      sourceGrade: "primary",
      dek: "Single transaction: borrow majority voting power via flash loan, pass emergency proposal, drain treasury. The template every flash-loan governance attack since has copied.",
      body: `Beanstalk was a stablecoin-issuing DeFi protocol built around BEAN, an algorithmic stablecoin maintained via on-chain "credit" / "debt" cycles. The protocol's governance was structured as continuous on-chain voting on proposals that could mutate the protocol's parameters or upgrade contracts.

On April 17, 2022 at 12:24 UTC, an attacker submitted Beanstalk Improvement Proposal 18 (BIP-18) — a proposal that, if passed, would transfer $182 million of Beanstalk's reserves to an attacker-controlled multi-sig. Critically, BIP-18 sat in the 24-hour grace period most BIPs go through. The attacker then waited 24 hours, and in a single transaction:

1. Used Aave's flash-loan facility to borrow ~$1 billion worth of stablecoins.
2. Used those stablecoins to acquire enough BEAN governance tokens to reach the supermajority threshold for emergency execution.
3. Voted in favor of BIP-18 at the supermajority threshold.
4. Triggered emergency execution of BIP-18, which transferred the $182 million reserve to the attacker's wallet.
5. Repaid the flash loan.
6. Net profit: ~$76 million after gas and slippage. The protocol was rendered insolvent.

The attacker's wallet is publicly identified as 0x1c5dCdd006EA78a7E4783f9e6021C32935a10fb4 (Etherscan label: "Beanstalk Flashloan Exploiter"). The on-chain trail showed the attacker donated approximately $250,000 worth of ETH to Ukrainian relief addresses via the standard donate-to-Ukraine pattern of the time — interpreted by chain analysts as a deliberate signaling gesture to deflect from the profit motive.

Beanstalk relaunched in August 2022 with substantially redesigned governance: emergency-execution thresholds raised, BEAN-token flash-borrow detection added at the proposal-execution layer, and a "Barnraise" community fundraise that re-capitalized the protocol from scratch. The case became the template every subsequent flash-loan governance attack (Mango Markets / Eisenberg) has cited as the operational model.`,
      bodyFormat: "plain",
      personas: ["compliance", "investigator", "exchange-risk"],
      sources: [
        "https://bean.money/blog/beanstalk-governance-exploit",
        "https://www.peckshield.com/news/beanstalk-incident-analysis",
        "https://blog.openzeppelin.com/beanstalk-logic-error",
      ],
      links: [
        "https://etherscan.io/address/0x1c5dCdd006EA78a7E4783f9e6021C32935a10fb4",
      ],
    },
    addresses: [
      {
        chain: "ethereum",
        address: "0x1c5dCdd006EA78a7E4783f9e6021C32935a10fb4",
        role: "subject",
        category: "hack-source",
        ownerName: "Beanstalk Farms Exploiter (Apr 2022)",
        ownerKind: "unknown",
        source: "rexintel-curated",
        label: "Beanstalk Flashloan Exploiter · ~$76M net",
        confidence: 100,
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────
  // 7. Euler Finance March 2023 — donateToReserves bug, returned funds.
  // ─────────────────────────────────────────────────────────────────────
  {
    payload: {
      headline:
        "Euler Finance March 2023 — $197M drained, fully returned 23 days later",
      kind: "incident",
      category: "DeFi exploit",
      severity: "high",
      anonymous: true,
      sourceHarvester: "gemini-editor",
      sourceGrade: "primary",
      dek: "A donateToReserves logic bug + flash-loan combo extracted $197M from Euler. The attacker negotiated publicly via on-chain messages — and returned every dollar within 23 days. The rare full-recovery DeFi incident.",
      body: `Euler was a permissionless lending protocol on Ethereum that introduced asset-class tiering (collateralization parameters varied by asset risk). It launched December 2021 and by early 2023 was managing roughly $300M in TVL across cross-tier lending positions.

On March 13, 2023, an attacker exploited a logic bug in Euler's donateToReserves function combined with flash-loan-funded leverage. The donateToReserves path allowed accounts to gift collateral into the protocol's reserve, but the resulting health-check used the donated balance without accounting for outstanding flash-loan liabilities. The attacker:

1. Took a flash loan from Aave.
2. Deposited the borrowed amount into Euler as collateral.
3. Donated a portion to reserves, which artificially inflated their leverage capacity.
4. Withdrew under the inflated capacity, draining real protocol reserves.
5. Repaid the flash loan.

Total drained across six attacker addresses (the principal initial wallet was 0xb66cd966670d962C227B3EABA30a872DbFb995db): approximately $197 million in DAI, USDC, WBTC, and stETH.

The recovery story is what makes this case singular. Within days of the drain, the attacker began returning portions of the stolen funds. They sent on-chain messages negotiating with the Euler team, sometimes responding to specific recovery proposals from Euler Labs. The Euler team set up a "Whitehat Reward" framework — initially declined by the attacker — and continued the public dialogue via Twitter and on-chain messages.

On April 4, 2023, 23 days after the original exploit, the attacker completed the return of every dollar of stolen funds. They did so via the original principal address, signing the final tranches with messages confirming completion. The motivations were never made public; the attacker's identity remains unknown. Euler's protocol relaunched with patched contracts later in 2023.

Outside of Poly Network 2021 (also a full-return case), Euler is the cleanest example of negotiated DeFi-exploit recovery. The on-chain negotiation transcript has been preserved as one of the most-cited references in operational incident-response playbooks across DeFi treasury teams.`,
      bodyFormat: "plain",
      personas: ["compliance", "investigator", "fund-risk"],
      sources: [
        "https://www.halborn.com/blog/post/explained-the-euler-finance-hack-march-2023",
        "https://www.euler.finance/blog/exploit-update",
        "https://www.theblock.co/post/220910/euler-finance-attacker-returns-all-funds",
      ],
      links: [
        "https://etherscan.io/address/0xb66cd966670d962C227B3EABA30a872DbFb995db",
      ],
    },
    addresses: [
      {
        chain: "ethereum",
        address: "0xb66cd966670d962C227B3EABA30a872DbFb995db",
        role: "subject",
        category: "hack-source",
        ownerName: "Euler Finance Exploiter (March 2023 — funds returned)",
        ownerKind: "unknown",
        source: "rexintel-curated",
        label: "Euler Exploiter · $197M drained, fully returned Apr 2023",
        confidence: 100,
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────
  // 8. Curve Finance July 2023 — Vyper compiler reentrancy.
  // ─────────────────────────────────────────────────────────────────────
  {
    payload: {
      headline:
        "Curve Finance July 2023 — $73M drained via Vyper compiler reentrancy bug",
      kind: "incident",
      category: "DeFi exploit",
      severity: "high",
      anonymous: true,
      sourceHarvester: "gemini-editor",
      sourceGrade: "primary",
      dek: "Not a contract bug — a compiler bug. Every Vyper project shipped on three specific compiler versions was suddenly vulnerable. Multiple attackers raced through pools; ~$67M was recovered by white-hat MEV bots front-running malicious tx.",
      body: `On July 30, 2023, multiple Curve Finance liquidity pools — including pETH, aETH, msETH, and CRV/ETH — were drained in rapid succession. Total initial loss: approximately $73 million across the affected pools. The vulnerability was not in Curve's contracts but in the Vyper compiler itself: versions 0.2.15, 0.2.16, and 0.3.0 generated reentrancy guards that, under specific call-pattern sequences, failed to actually prevent reentrant calls.

The implication was immediately catastrophic: every smart contract compiled with those three Vyper versions was suddenly potentially vulnerable, even contracts that had been formally audited and considered safe. The Vyper team coordinated an emergency disclosure within hours and recommended every affected project rotate to a patched compiler version.

What followed was an unusual race condition: as the original attacker's exploits became public on-chain, multiple white-hat MEV bot operators identified the pattern and began front-running malicious transactions in the still-vulnerable pools. The result was a multi-actor scramble where ~$67 million of the initial drain was effectively re-captured by white-hats and returned to Curve via the team's established recovery framework. The remaining ~$5.7 million stayed with the original attacker(s).

The on-chain identity of the original attacker(s) remained partially unresolved — at least three distinct attacker patterns were identified across the four pools, suggesting either a coordinated multi-actor team or several independent operators racing through the same window. One of the wallets did publicly return funds via Curve's negotiation framework; the others did not.

The case redefined how DeFi teams think about audit scope. A perfectly-audited contract is not necessarily safe if the compiler it was built with has a vulnerability; toolchain-level audits and pinned-compiler-version tracking became standard practice for major protocols in late 2023. The Vyper team subsequently shipped patches and a long-form retrospective; the patched compiler versions are now considered safe for the patterns exploited in the July 2023 incident.`,
      bodyFormat: "plain",
      personas: ["compliance", "investigator", "fund-risk"],
      sources: [
        "https://twitter.com/curvefinance/status/168569368969270912",
        "https://blog.openzeppelin.com/vyper-compiler-vulnerability",
        "https://www.coindesk.com/tech/2023/07/30/curve-finance-vyper-compiler-vulnerability-leads-to-massive-loss-of-funds/",
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
        `[dry-run] ${seed.addresses.length} addresses, ${seed.payload.sources?.length ?? 0} sources, ${seed.payload.links?.length ?? 0} links`,
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
  if (errors.length > 0) {
    console.log("\nErrors:");
    for (const e of errors.slice(0, 20)) {
      console.log(`  · ${e.headline.slice(0, 60)}: ${e.error}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
