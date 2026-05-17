/**
 * Run with: npx tsx scripts/seed-intel-incidents.ts
 *
 * Seeds /intel with evergreen incident postmortems — the SEO surface that
 * ranks for "[protocol] hack timeline" queries. Each row is kind="incident",
 * status="approved", anonymous=true (in-house byline), with citations to
 * the canonical primary sources (Chainalysis, TRM, Elliptic, Mandiant,
 * SlowMist, official team postmortems).
 *
 * Curation rule: only incidents with (a) a published root cause, (b) a
 * traceable on-chain footprint, and (c) at least one reputable third-party
 * investigation. We do NOT fabricate addresses — anything we cite by hash
 * is traceable from the linked source.
 *
 * Idempotent: matches on payload->>'headline'. Re-running refreshes content
 * but preserves publicId (so canonical URLs stay stable).
 */
import "dotenv/config";
import { and, eq, sql } from "drizzle-orm";
import { db, submissions } from "../src/lib/db";
import type { IntelPayload } from "../src/lib/db/schema";
import type { PersonaSlug } from "../src/lib/personas";

// Default audience for postmortem rows — covers the three priority digest
// variants (compliance, investigator, fund-risk) plus exchange T&S and
// gov/LE who actively chase these incidents. Individual rows may override.
const INCIDENT_DEFAULT_PERSONAS: PersonaSlug[] = [
  "compliance",
  "investigator",
  "exchange-risk",
  "gov-le",
  "fund-risk",
];

const incidents: IntelPayload[] = [
  {
    headline: "Bybit $1.5B hack — Feb 2025 — timeline & laundering trail",
    kind: "incident",
    category: "Exchange hack",
    severity: "critical",
    anonymous: true,
    body: [
      "On 21 Feb 2025, Bybit lost ~401,000 ETH (≈$1.5B at the time) in the largest single crypto theft ever recorded. The FBI publicly attributed it to North Korea's Lazarus Group on 26 Feb. NCC Group and TRM Labs published technical reconstructions within the week.",
      "",
      "**Root cause.** Bybit was moving funds from cold to warm storage through a multi-sig signing workflow operated via a third-party UI. Lazarus compromised a developer machine at that third party, injected JavaScript into the signing interface, and silently rewrote the destination on a single transaction that the human signers approved against what looked like the expected payload. The cold wallet's own contracts and keys were never broken — the human-machine boundary was.",
      "",
      "**Why it matters.** This is the canonical example of the 'sign-blind' failure mode: when a multi-sig depends on a UI that you don't control end-to-end, the UI becomes the de-facto signer. Every multi-sig signing flow that surfaces transactions through a hosted dashboard now inherits this risk model.",
      "",
      "**Laundering.** Lazarus moved the bulk of the stolen ETH through cross-chain bridges and crypto mixers in the days following the theft. TRM and Chainalysis identified a 45-day laundering cycle pattern, with most outflows in tranches under $500k — consistent with the heightened operational security DPRK clusters have adopted post-Tornado Cash delisting.",
      "",
      "**Read on.** TRM's live blocklist of attacker addresses is the highest-fidelity public tracker.",
    ].join("\n"),
    sources: [
      "https://www.trmlabs.com/resources/blog/the-bybit-hack-following-north-koreas-largest-exploit",
      "https://www.nccgroup.com/research/in-depth-technical-analysis-of-the-bybit-hack/",
      "https://www.csis.org/analysis/bybit-heist-and-future-us-crypto-regulation",
    ],
    links: [
      "https://www.trmlabs.com/resources/blog/the-bybit-hack-following-north-koreas-largest-exploit",
    ],
  },
  {
    headline: "Ronin Bridge $625M hack — Mar 2022 — Lazarus & the 5/9 validator failure",
    kind: "incident",
    category: "Bridge hack",
    severity: "critical",
    anonymous: true,
    body: [
      "On 23 Mar 2022, attackers drained 173,600 ETH and 25.5M USDC (~$625M) from the Ronin bridge — the sidechain Sky Mavis built for Axie Infinity. The theft went undetected for six days; it surfaced on 29 Mar only when a user couldn't withdraw. OFAC sanctioned the attacker address on 14 Apr and named Lazarus Group as the operator.",
      "",
      "**Root cause.** Ronin's bridge required 5-of-9 validator signatures to move funds. Sky Mavis ran four of those validators; Axie DAO ran a fifth that, post-incident, was found to still be allow-listed to Sky Mavis infrastructure from an earlier ops arrangement. Lazarus social-engineered access to all four Sky Mavis validators plus that fifth allow-listed key — five signatures, full bridge drained.",
      "",
      "**Sanctioned attacker address.** `0x098B716B8Aaf21512996dC57EB0615e2383E2f96` (Ethereum). Added to the OFAC SDN list 14 Apr 2022. A primary laundering route ran through Tornado Cash before its own sanctioning in Aug 2022 forced rotation to alternative mixers.",
      "",
      "**Why it matters.** This is the cleanest case study for why M-of-N bridge designs concentrate, rather than distribute, risk: in practice the N validators are rarely as independent as the architecture diagram implies. Ronin migrated to an OP Stack L2 in 2026 — four years after the hack — explicitly to retire that trust model.",
    ].join("\n"),
    sources: [
      "https://www.elliptic.co/blog/540-million-stolen-from-the-ronin-defi-bridge",
      "https://cyberscoop.com/ronin-bridge-hack-lazarus-group-north-korea-treasury-sanctions/",
      "https://github.com/tayvano/lazarus-bluenoroff-research/blob/main/hacks-and-thefts/ronin_bridge.md",
    ],
    links: [
      "https://etherscan.io/address/0x098B716B8Aaf21512996dC57EB0615e2383E2f96",
    ],
  },
  {
    headline: "Wormhole $325M hack — Feb 2022 — Solana signature verification bypass",
    kind: "incident",
    category: "Bridge hack",
    severity: "critical",
    anonymous: true,
    body: [
      "On 2 Feb 2022, an attacker minted 120,000 wETH (~$325M) on Solana out of nothing by bypassing signature verification on the Wormhole bridge. Jump Crypto, which had backed Wormhole's development, replaced the full $325M within 24 hours.",
      "",
      "**Root cause.** Wormhole's Solana program used a deprecated Solana sysvar verification function that didn't validate the account passed to it. The attacker passed a forged Sysvar account, crafted a 'message' authorizing the mint of 120k wETH, and the program accepted it. A fix had landed in Wormhole's GitHub repo hours before the exploit — the attacker appears to have noticed the patch and weaponized the still-deployed vulnerable contract before mainnet redeployment.",
      "",
      "**Why it matters.** Bridges that mint wrapped assets are infinite-money bugs waiting to happen — any signature verification flaw lets the attacker print collateral the bridge then has to honor. The Wormhole pattern (deprecated primitive + lagging deployment) is the same shape that's recurred across half a dozen bridge incidents since.",
      "",
      "**Coda.** Jump's reimbursement preserved Wormhole's solvency. The attacker funds sat dormant for nearly a year before laundering activity resumed in early 2023.",
    ].join("\n"),
    sources: [
      "https://www.chainalysis.com/blog/wormhole-hack-february-2022/",
      "https://www.elliptic.co/blog/325-million-stolen-from-wormhole-defi-service",
      "https://www.halborn.com/blog/post/explained-the-wormhole-hack-february-2022",
    ],
  },
  {
    headline: "Nomad Bridge $190M hack — Aug 2022 — the copy-paste mob attack",
    kind: "incident",
    category: "Bridge hack",
    severity: "critical",
    anonymous: true,
    body: [
      "On 1 Aug 2022, the Nomad token bridge was drained of ~$190M in ~150 minutes by roughly 300 different addresses. It is the only major crypto exploit on record where the attack vector was permissionless: anyone who saw the first malicious transaction could copy it, change the recipient, and resubmit it.",
      "",
      "**Root cause.** A routine upgrade initialized the bridge's trusted Merkle root to `0x00`. As a side-effect, any message whose proof hashed to zero was accepted as 'already proven valid' — and crafting such a proof was trivial. The first attacker drained 100 WBTC. Then on-chain observers saw the transaction, copied the calldata into Etherscan's contract write UI, replaced the recipient with their own address, and re-broadcast. The bridge died in real time, in front of an audience.",
      "",
      "**Why it matters.** Most exploits gate behind a vulnerability that takes specialized expertise to weaponize. Nomad shows what happens when the bug is so primitive that the exploit is reproducible by reading mempool — the loss curve goes vertical. About $37M was returned by white-hats; the rest was scattered across hundreds of small recipients, making clawback essentially impossible.",
      "",
      "**Aftermath.** A key suspect was extradited to the US in 2024. An Israeli arrest of another participant followed in 2025.",
    ].join("\n"),
    sources: [
      "https://medium.com/immunefi/hack-analysis-nomad-bridge-august-2022-5aa63d53814a",
      "https://www.trmlabs.com/resources/blog/key-suspect-in-190m-nomad-bridge-exploit-extradited-to-the-united-states",
      "https://cloud.google.com/blog/topics/threat-intelligence/dissecting-nomad-bridge-hack",
    ],
  },
  {
    headline: "Euler Finance $197M hack — Mar 2023 — donateToReserves and the full recovery",
    kind: "incident",
    category: "DeFi exploit",
    severity: "high",
    anonymous: true,
    body: [
      "On 13 Mar 2023, an attacker drained $197M from Euler Finance via six flash-loan-funded transactions, most of the loot denominated in stETH. The story is famous for a different reason: the attacker returned ~$240M in stolen assets over the following three weeks, the largest voluntary return on record.",
      "",
      "**Root cause.** Euler's `donateToReserves()` function let a user gift their position's collateral to the protocol — but did not first check whether the donor's position remained solvent after the gift. The attacker engineered an insolvent position, donated their collateral, and then triggered the protocol's own liquidation flow against the now-bad position. Euler's liquidation contract offered a steep discount to liquidators, which the attacker — also acting as the liquidator — captured.",
      "",
      "**The return.** Euler's team ran a 21-day private and on-chain negotiation. The attacker, going by 'Jacob,' returned funds in tranches: 3,000 ETH on Mar 18, 51,000 ETH on Mar 25, then 7,000 ETH and $10M DAI in the days after. By the time the recovery concluded, Euler had recovered more than the original loss after price appreciation on stETH.",
      "",
      "**Why it matters.** A single missing solvency check in a 1-line function obliterated $197M. It is the canonical reminder that 'donate' / 'deposit-for' / 'mint-to-other' helpers need the same invariant checks as the primary deposit/withdraw paths — auditors flag the primary path religiously and routinely skip the helper.",
    ].join("\n"),
    sources: [
      "https://www.chainalysis.com/blog/euler-finance-flash-loan-attack/",
      "https://www.euler.finance/blog/war-peace-behind-the-scenes-of-eulers-240m-exploit-recovery",
      "https://blocksec.com/blog/euler-finance-incident-the-largest-hack-of-2023",
    ],
  },
  {
    headline: "Atomic Wallet $100M+ hack — Jun 2023 — Lazarus targeting self-custody",
    kind: "incident",
    category: "Wallet compromise",
    severity: "critical",
    anonymous: true,
    body: [
      "On 3 Jun 2023, ~5,500 users of the self-custodial Atomic Wallet were drained simultaneously. Initial estimates pegged the loss at $35M; Elliptic's final accounting topped $100M. The FBI later confirmed Lazarus Group attribution.",
      "",
      "**Root cause (still partially undisclosed).** Atomic Wallet has never published a complete postmortem of the breach vector. Third-party analyses point to a compromise of the wallet's key-generation or key-export path, given the breadth of simultaneous victims across versions. A class action filed later in 2023 alleges Atomic shipped a vulnerable cryptographic build.",
      "",
      "**Why it matters.** Self-custodial wallets are not automatically safer than custodial ones — they shift the trust target from 'the exchange's security' to 'the wallet code's correctness.' Atomic showed that a single supply-chain or RNG-class flaw can produce a 5,500-victim multi-wallet harvest in one campaign, with no individual phishing event involved.",
      "",
      "**Laundering.** Lazarus rotated the funds through Russia's Garantex exchange after Tornado Cash sanctions made the mixer route harder. Elliptic and partner exchanges froze ~$1M of the stolen assets.",
    ].join("\n"),
    sources: [
      "https://www.elliptic.co/blog/analysis/north-korea-linked-atomic-wallet-heist-tops-100-million",
      "https://techcrunch.com/2023/08/23/fbi-north-korea-lazarus-crypto/",
    ],
  },
  {
    headline: "Curve Finance $70M hack — Jul 2023 — Vyper compiler reentrancy bug",
    kind: "incident",
    category: "DeFi exploit",
    severity: "high",
    anonymous: true,
    body: [
      "On 30 Jul 2023, multiple Curve liquidity pools — pETH/ETH (JPEG'd), alETH/ETH (Alchemix), msETH/ETH (Metronome), CRV/ETH, and Pendle's pETH/ETH — were drained in a coordinated set of reentrancy attacks. Final losses were ~$70M, reduced to ~$52M after white-hat recoveries.",
      "",
      "**Root cause.** The vulnerability lived in the Vyper compiler, not in any pool's source code. Vyper versions 0.2.15, 0.2.16, and 0.3.0 had a bug in storage-slot allocation for the `@nonreentrant` decorator: under certain conditions the reentrancy lock wrote to the wrong slot, so the lock was never actually engaged. Any pool compiled with those Vyper versions that relied on `@nonreentrant` to protect a balance-changing function was vulnerable.",
      "",
      "**Why it matters.** This is the only major DeFi incident where the bug was in the compiler — not in any individual project's code, not in any library it imported. Every audit of every affected pool had passed. The blast radius was set by which Vyper version each pool's deployer happened to use, which is not a property auditors normally check.",
      "",
      "**Market impact.** Curve TVL halved in 24 hours, briefly threatening the CRV-denominated debt position of Curve's founder on Aave — which would have cascaded into a CRV liquidation event. The incident is the reference case for 'compiler-as-attack-surface' in DeFi risk modeling.",
    ].join("\n"),
    sources: [
      "https://www.chainalysis.com/blog/curve-finance-liquidity-pool-hack/",
      "https://www.halborn.com/blog/post/explained-the-vyper-bug-hack-july-2023",
      "https://hacken.io/discover/curve-finance-liquidity-pools-hack-explained/",
    ],
  },
  {
    headline: "Multichain $125M+ collapse — Jul 2023 — the CEO arrest and missing MPC keys",
    kind: "incident",
    category: "Bridge hack",
    severity: "critical",
    anonymous: true,
    body: [
      "On 6 Jul 2023, cross-chain bridge Multichain suffered ~$125M in unauthorized outflows (final accounting reached ~$210M when later draws are included). Unlike most bridge exploits, the consensus reading is not 'hack' but 'inside job' — and the chain of events behind it reads like a thriller.",
      "",
      "**Background.** Multichain's CEO Zhaojun was reportedly arrested by Chinese authorities on 21 May 2023, more than six weeks before the outflows. On 31 May, the team publicly acknowledged it could not contact him. The protocol's MPC key shards were custodied in a way that critical operations required Zhaojun's participation — when he disappeared, so did operational control.",
      "",
      "**The outflows.** On 6 Jul, large unauthorized transfers began draining the bridge's Fantom contracts in particular ($120M+ from the Fantom side). Zhaojun's sister then transferred remaining funds to two addresses she controlled, claiming 'asset preservation'; Chinese police arrested her shortly after.",
      "",
      "**Why it matters.** Multichain is the only top-20 crypto incident where the proximate cause appears to be the disappearance of a single person who held de-facto custody. None of the firm's audits flagged the issue, because the failure wasn't in the code — it was in the human key-custody policy. Sonic Labs (formerly Fantom Foundation) secured court orders against the Multichain Foundation in 2025 to recover assets for affected users.",
    ].join("\n"),
    sources: [
      "https://www.chainalysis.com/blog/multichain-exploit-july-2023/",
      "https://www.dlnews.com/articles/defi/singapore-court-fuels-view-multichain-hack-was-inside-job/",
      "https://www.theblock.co/post/354439/sonic-labs-secures-court-order-to-liquidate-multichain-foundation-to-recoup-losses-from-210-million-exploit",
    ],
  },
  {
    headline: "Mixin Network $200M hack — Sep 2023 — cloud-provider database breach",
    kind: "incident",
    category: "Infrastructure breach",
    severity: "critical",
    anonymous: true,
    body: [
      "In the early hours of 23 Sep 2023, Mixin Network — a decentralized cross-chain wallet network — lost ~$200M after attackers breached the database of its unnamed cloud-services provider. Most of the loss was in Bitcoin, with significant ETH and USDT components.",
      "",
      "**Root cause.** Mixin's network depends on a cloud-hosted database for parts of its operations. The attacker compromised that database (the cloud provider has never been publicly identified), which gave them access to material needed to authorize transfers from Mixin's hot infrastructure. Mixin engaged Google and SlowMist for forensics.",
      "",
      "**Why it matters.** It is the largest crypto loss caused by upstream cloud-supply-chain compromise, not by an on-chain vulnerability or social engineering of the team. The architecture lesson — that 'decentralized' protocols can still concentrate enormous off-chain dependencies — keeps re-asserting itself; Mixin remains the clearest case study.",
      "",
      "**Aftermath.** Mixin suspended deposits and withdrawals immediately. The platform's recovery plan offered users partial repayment from future protocol revenue rather than direct reimbursement — a controversial structure that left many users effectively bagholding the loss.",
    ].join("\n"),
    sources: [
      "https://www.bleepingcomputer.com/news/security/mixin-network-suspends-operations-following-200-million-hack/",
      "https://cryptoslate.com/mixin-network-loses-200m-in-attack-of-its-cloud-provider/",
    ],
  },
  {
    headline: "Poloniex $126M hack — Nov 2023 — hot-wallet drain attributed to Lazarus",
    kind: "incident",
    category: "Exchange hack",
    severity: "critical",
    anonymous: true,
    body: [
      "On 10 Nov 2023, Justin Sun's Poloniex exchange lost ~$126M from a hot wallet labeled 'Poloniex 4.' Hundreds of unauthorized transactions drained ETH, TRX (~288M tokens), and ~865 BTC over a single hour. SlowMist and Elliptic attributed the attack to Lazarus Group's BlueNoroff sub-cluster.",
      "",
      "**Root cause.** Attackers obtained access to hot-wallet private keys stored within Poloniex's internal systems, then escalated privileges and signed the drain transactions directly. The exact initial-access vector (phishing of an admin, malware on a privileged workstation, etc.) has not been publicly disclosed.",
      "",
      "**Response.** Sun offered a 5% white-hat bounty initially, then raised it to $10M with a 25 Nov deadline; the attacker did not accept. Sun publicly committed to fully reimbursing affected users from Poloniex's own funds, and the exchange resumed operations on a phased basis.",
      "",
      "**Why it matters.** Poloniex is a clean example of the BlueNoroff playbook: target an exchange's privileged-user perimeter, harvest hot-wallet keys, drain in tight time windows to outrun monitoring. It immediately preceded the larger 2024 cluster of Lazarus-attributed exchange compromises (DMM, WazirX).",
    ].join("\n"),
    sources: [
      "https://www.halborn.com/blog/post/explained-the-poloniex-hack-november-2023",
      "https://www.theregister.com/2023/11/10/justin_sun_poloniex_reward/",
    ],
  },
  {
    headline: "Munchables $62.5M hack — Mar 2024 — DPRK IT-worker insider, full recovery",
    kind: "incident",
    category: "Insider compromise",
    severity: "high",
    anonymous: true,
    body: [
      "On 26 Mar 2024, Blast-based NFT game Munchables lost 17,414 ETH (~$62.5M) when a contractor on the engineering team — later identified by ZachXBT and others as a likely DPRK IT-worker plant — exploited backdoors they themselves had built into the project's smart contracts.",
      "",
      "**Root cause.** Munchables hired multiple developers (ZachXBT's investigation concluded all four 'developers' were the same person operating under different identities) who were credentialed onto the project's contract repo. They authored upgrade-eligible contract logic with a back-door path that they later exercised to mint themselves the protocol's underlying ETH.",
      "",
      "**Recovery.** Munchables retook control of the funds within a day. The contractor returned the private keys to the cold wallet without ransom — likely because Blast's nascent state made laundering impractical: third-party bridges from Blast had imposed 3-ETH-per-transaction transfer limits, making it impossible to off-ramp $62M without weeks of exposure.",
      "",
      "**Why it matters.** Munchables is the cleanest public case study of the DPRK IT-worker infiltration pattern — paid contributors with falsified identities embedded inside crypto teams, building exploits into the codebase itself. Chainalysis and TRM have flagged this as the dominant DPRK pattern in 2024-2025, accounting for a growing share of the cluster's $2B+ annual take.",
    ].join("\n"),
    sources: [
      "https://www.coindesk.com/tech/2024/03/27/munchables-exploited-for-62m-ether-linked-to-rogue-north-korean-team-member",
      "https://github.com/tayvano/lazarus-bluenoroff-research/blob/main/hacks-and-thefts/munchables.md",
      "https://www.halborn.com/blog/post/explained-the-munchables-hack-march-2024",
    ],
  },
  {
    headline: "DMM Bitcoin $305M hack — May 2024 — TraderTraitor supply-chain compromise",
    kind: "incident",
    category: "Exchange hack",
    severity: "critical",
    anonymous: true,
    body: [
      "On 30 May 2024, Japanese exchange DMM Bitcoin lost 4,502 BTC (~$305M at the time) in an unauthorized transfer. US and Japanese authorities jointly attributed the theft to the TraderTraitor cluster (also tracked as Jade Sleet, UNC4899, Slow Pisces — a Lazarus sub-group). DMM announced its winding-down in late 2024.",
      "",
      "**Root cause.** The intrusion entered upstream: DPRK actors targeted Ginco, a Japanese wallet-software company that supplied DMM. A Ginco employee was contacted via LinkedIn by an attacker posing as a recruiter, asked to complete a 'pre-employment test' that involved a Python script hosted on GitHub. The employee copied the script to their personal GitHub. From there, the attacker reached Ginco's wallet management system — and through Ginco, DMM's signing infrastructure.",
      "",
      "**Why it matters.** DMM is the canonical supply-chain hack of the cycle: the exchange itself was breached through a vendor that itself was breached through a single phished engineer through GitHub. The kill chain is the same one Mandiant has linked to the JumpCloud, 3CX, and downstream crypto incidents — Lazarus's preferred attack on the West.",
      "",
      "**Laundering.** Funds were rotated through privacy mixers, then THORChain to Avalanche/Ethereum, and a portion (~$35M+) was laundered through Huione Guarantee, a Southeast Asian marketplace that has emerged as a primary off-ramp for North Korean and pig-butchering operations.",
    ].join("\n"),
    sources: [
      "https://www.merklescience.com/blog/hack-track-dmm-flow-of-funds-analysis",
      "https://thehackernews.com/2024/12/north-korean-hackers-pull-off-308m.html",
      "https://www.coindesk.com/business/2024/12/02/japanese-crypto-exchange-dmm-bitcoin-to-shut-down-after-305-m-hack",
    ],
  },
  {
    headline: "WazirX $230M hack — Jul 2024 — Liminal multisig and the upgraded contract",
    kind: "incident",
    category: "Exchange hack",
    severity: "critical",
    anonymous: true,
    body: [
      "On 18 Jul 2024, Indian exchange WazirX lost ~$234.9M from a Safe multisig held under joint custody with Liminal Custody. Mudit Gupta and others tied the operation to Lazarus Group based on on-chain rehearsal patterns dating back at least 8 days before the drain.",
      "",
      "**Root cause.** The multisig required 3-of-5 WazirX signatures + 1 Liminal signature. Lazarus compromised two WazirX signers directly via phishing, then used a fake Liminal frontend to trick the remaining WazirX signer and the Liminal signer into approving a malicious transaction. The 'transaction' as displayed by the fake UI looked like a routine transfer; the actual on-chain payload upgraded the Safe's underlying implementation to an attacker-controlled contract. Once upgraded, the funds were drained at the attacker's leisure.",
      "",
      "**Why it matters.** WazirX is the second canonical example (alongside Bybit, six months later) of the sign-blind multisig: the human signers were defrauded at the UI layer, not at the cryptography layer. Mandiant traced the entry point to Liminal's frontend; Liminal disputed parts of the methodology. Either way, the failure mode — UI-and-payload divergence — is now the most important risk in any institutional signing flow.",
      "",
      "**Aftermath.** WazirX entered a restructuring; operations resumed Oct 2025 with ~85% user restitution and a temporary 0% trading-fee program.",
    ].join("\n"),
    sources: [
      "https://crystalintelligence.com/investigations/expert-analysis-wazirx-hack/",
      "https://www.halborn.com/blog/post/explained-the-wazirx-hack-july-2024",
      "https://en.wikipedia.org/wiki/2024_WazirX_hack",
    ],
  },
  {
    headline: "Radiant Capital $50M hack — Oct 2024 — Telegram-phished contractor & INLETDRIFT",
    kind: "incident",
    category: "Protocol compromise",
    severity: "critical",
    anonymous: true,
    body: [
      "On 16 Oct 2024, DeFi lender Radiant Capital lost ~$50M after attackers gained control of multiple signers' private keys. Mandiant attributed the operation to UNC4736 (a.k.a. AppleJeus / Citrine Sleet), a DPRK Reconnaissance General Bureau sub-cluster overlapping with Lazarus.",
      "",
      "**Root cause.** On 11 Sep 2024 — five weeks before the drain — a Radiant developer received a Telegram message from someone impersonating a former contractor, sharing a PDF inside a ZIP. The ZIP delivered INLETDRIFT, a macOS backdoor. The malware sat dormant while attackers staged across multiple signer machines. When the drain executed, transaction simulations and standard pre-sign checks all returned the expected output — the malicious payload only diverged at the actual on-chain submission step.",
      "",
      "**Why it matters.** Radiant is the reference case for the 'long-dwell signer compromise' pattern: DPRK actors gain footholds on developer endpoints weeks ahead, then execute the drain in a single coordinated action that defeats per-transaction review. Every multisig that depends on individual signer machines being clean inherits this risk model.",
      "",
      "**Read on.** Radiant's own postmortem (Dec 2024) is unusually detailed about the attack chain and the simulation-bypass mechanism — recommended reading for any team running a multi-sig in production.",
    ].join("\n"),
    sources: [
      "https://www.coindesk.com/tech/2024/12/09/radiant-capital-says-north-korean-hackers-behind-50-million-attack-in-october",
      "https://therecord.media/radiant-capital-heist-north-korea",
      "https://decrypt.co/295545/radiant-capital-says-dprk-actor-posed-as-ex-contractor-to-pull-off-50-million-hack",
    ],
  },
  {
    headline: "Mt. Gox $450M collapse — 2014 — the slow-bleed and BTC-e laundering",
    kind: "incident",
    category: "Exchange hack",
    severity: "critical",
    anonymous: true,
    body: [
      "Mt. Gox handled 70%+ of all Bitcoin transactions globally in early 2014 when it abruptly ceased operations, revealing ~850,000 BTC missing (~$450M at the time; ~$60B+ at 2025 prices). It remains the foundational crypto incident — every postmortem framework in the industry still references it.",
      "",
      "**Root cause.** WizSec's 2015 forensic work showed the funds weren't taken in 2014 — they had been slowly bled out since 2011 via the transaction-malleability bug, which let attackers manipulate transaction IDs to make withdrawals appear failed and trigger duplicate sends. The exchange's internal accounting never reconciled against the on-chain reality, so the deficit compounded for years.",
      "",
      "**The laundering trail.** Alexander Vinnik, arrested in Greece in 2017, is believed to have laundered 80%+ of the stolen BTC through BTC-e, an exchange he helped administer. The US DOJ ultimately charged him with laundering $4B+ in Bitcoin. The Vinnik case is the canonical 'exchange-as-laundromat' enforcement precedent.",
      "",
      "**Why it still matters.** Mt. Gox creditor repayments are still being distributed more than a decade later via the Trustee process. The case established several legal precedents (rehabilitation under Japanese bankruptcy law, in-kind BTC distribution, creditor-class structure) that every subsequent crypto bankruptcy — FTX, Celsius, BlockFi — has had to navigate.",
    ].join("\n"),
    sources: [
      "https://en.wikipedia.org/wiki/Mt._Gox",
      "https://fortune.com/longform/bitcoin-mt-gox-hack-karpeles/",
      "https://medium.com/coinmonks/mt-gox-unveiled-the-real-story-a-decade-after-the-collapse-84323be2f930",
    ],
  },
  {
    headline: "Poly Network $611M hack — Aug 2021 — 'Mr. White Hat' and the full return",
    kind: "incident",
    category: "Bridge hack",
    severity: "critical",
    anonymous: true,
    body: [
      "On 10 Aug 2021, an unidentified attacker stole $611M from cross-chain protocol Poly Network — the largest DeFi theft on record at the time. Within 24 hours the attacker had publicly announced they'd return everything. Over the next 15 days, they did.",
      "",
      "**Root cause.** The exploit lived in the access-rights model between two Poly contracts — `EthCrossChainManager` and `EthCrossChainData`. The Manager could call any function on the Data contract, including the one that updates the keeper-public-key list. The attacker crafted a cross-chain message that, when relayed through the Manager, rewrote the keeper to their own key — and then signed off on transferring out the protocol's assets across BSC, Ethereum, and Polygon.",
      "",
      "**The return.** Poly publicly addressed the attacker as 'Mr. White Hat,' offered a $500k bounty, and floated a 'chief security advisor' role to incentivize cooperation. The attacker returned the funds. ~$33M in USDT was the only piece not returned — it had been frozen by Tether before the negotiation concluded.",
      "",
      "**Why it matters.** Poly is the canonical case study for *return-incentive negotiation* — and a source of lasting controversy in the security community for legitimizing 'white hat' framing of what was a 9-figure unauthorized theft. The pattern (large theft → public negotiation → full return) recurred at Euler (2023) and Munchables (2024), each time more procedurally formalized.",
    ].join("\n"),
    sources: [
      "https://www.chainalysis.com/blog/poly-network-hack-august-2021/",
      "https://en.wikipedia.org/wiki/Poly_Network_exploit",
      "https://research.kudelskisecurity.com/2021/08/12/the-poly-network-hack-explained/",
    ],
  },
  {
    headline: "FTX $477M post-bankruptcy hack — Nov 2022 — drain during the chaos",
    kind: "incident",
    category: "Exchange hack",
    severity: "critical",
    anonymous: true,
    body: [
      "Separate from the underlying $8B Alameda misappropriation that destroyed FTX, on 11 Nov 2022 — the same day FTX, Alameda, and 100+ affiliated entities filed for Chapter 11 — an unknown actor drained ~$477M from FTX wallets in coordinated transactions that began within hours of the bankruptcy filing.",
      "",
      "**Two events, often conflated.** The collapse itself was an internal misuse of customer funds: Alameda had borrowed ~$8B from FTX customer deposits to cover trading losses, eventually surfacing as a 'Korean friend' negative balance. SBF was convicted in 2023 (sentenced Mar 2024 to 25 years + $11.02B forfeiture). The $477M drain on Nov 11 is a *separate* event — an external (or possibly insider) actor exfiltrating funds during the operational chaos of the filing.",
      "",
      "**The drain's attribution.** Multiple investigators have suggested DPRK-linked operators based on subsequent laundering patterns (THORChain bridging, sub-$500k tranches consistent with the cluster's later DMM / Bybit playbook). No formal attribution has been publicly issued, but the timing — moving in within hours of an unprecedented operational crisis at a major exchange — and the laundering signature strongly suggest a watching/waiting threat actor.",
      "",
      "**Why it matters.** FTX is the load-bearing example for two distinct things: (a) the collapse-via-misappropriation pattern that's recurred at every centralized-exchange failure since (Celsius, BlockFi, Gemini-Earn), and (b) the secondary-attack risk during bankruptcy ops — proof that the moment of organizational discontinuity is itself an attack surface.",
    ].join("\n"),
    sources: [
      "https://en.wikipedia.org/wiki/Bankruptcy_of_FTX",
      "https://www.theblock.co/post/256106/a-complete-timeline-of-ftx-from-alamedas-spiraling-debt-to-its-dramatic-implosion",
      "https://time.com/6243086/ftx-where-did-money-go/",
    ],
  },
  {
    headline: "Harmony Horizon $100M bridge hack — Jun 2022 — Lazarus, Tornado Cash trail",
    kind: "incident",
    category: "Bridge hack",
    severity: "critical",
    anonymous: true,
    body: [
      "On 24 Jun 2022, Harmony's Horizon cross-chain bridge was drained of ~$99.7M after attackers compromised the cryptographic keys of its multisig wallet. The FBI publicly attributed the theft to Lazarus Group in Jan 2023.",
      "",
      "**Root cause.** Horizon's bridge was a 2-of-5 multisig. Lazarus social-engineered access to two of those signers' keys — most likely through targeted phishing of Harmony engineers, given the cluster's documented Telegram / LinkedIn playbook in this window. Two signatures, full bridge drained.",
      "",
      "**The laundering trail.** Lazarus moved ~$96M of the stolen Horizon funds through Tornado Cash. Elliptic's analysis tied this trail (combined with the ~$468M from Ronin and other Lazarus-attributed flows) to over $555M of TC volume from DPRK clusters — the dataset Treasury cited when sanctioning Tornado Cash in Aug 2022, two months later.",
      "",
      "**Why it matters.** Harmony is the bridge-hack twin of Ronin — same M-of-N validator architecture, same social-engineering kill chain, same Lazarus operator. Read together, they are the strongest available evidence that 'just decentralize the multisig more' is not a sufficient mitigation: the bottleneck is the M signers' endpoints, not the cryptography.",
    ].join("\n"),
    sources: [
      "https://www.elliptic.co/blog/analysis/the-100-million-horizon-hack-following-the-trail-through-tornado-cash-to-north-korea",
      "https://www.elliptic.co/blog/analysis/fbi-confirms-north-korea-s-lazarus-group-as-hackers-behind-100-million-harmony-horizon-bridge-theft",
      "https://therecord.media/fbi-north-korean-hacking-group-lazarus-behind-100-million-crypto-heist",
    ],
  },
  {
    headline: "BNB Bridge $570M hack — Oct 2022 — IAVL Merkle proof forgery",
    kind: "incident",
    category: "Bridge hack",
    severity: "critical",
    anonymous: true,
    body: [
      "On 7 Oct 2022, the BSC Token Hub bridge was exploited for 2 million BNB (~$570M at the time). Binance halted the chain itself to stop the bleed — one of the rare events that exposed how centralized BSC's validator set actually is.",
      "",
      "**Root cause.** The bridge used IAVL Merkle proofs (from Cosmos's IAVL+ tree library) to verify cross-chain deposits. A flaw in the proof verification logic let the attacker forge a proof for block 110217401 that the bridge accepted as valid. After registering as a relayer for the bridge to set up the infrastructure, the attacker submitted the forged proof and minted themselves 2M BNB to a newly-generated wallet.",
      "",
      "**The chain halt.** Binance coordinated with the (then ~26) BSC validators to halt block production within hours. Roughly $7M was frozen in transit. The event made explicit what had been implicit: BSC's validator set is operationally coordinated by Binance, which is why the chain *could* be halted — and what 'decentralization' actually means in BSC's threat model.",
      "",
      "**Why it matters.** Together with Ronin and Wormhole, the BNB Bridge incident is one of the three canonical 2022 bridge-architecture failures (validator-set capture, signature-verification bypass, message-proof construction). It is the cleanest example of the proof-construction failure mode and the de-facto reason every major cross-chain message protocol since has invested heavily in formal verification of its proof-acceptance path.",
    ].join("\n"),
    sources: [
      "https://www.halborn.com/blog/post/explained-the-bnb-chain-hack-october-2022",
      "https://medium.com/immunefi/hack-analysis-binance-bridge-october-2022-2876d39247c1",
      "https://swarm.ptsecurity.com/binance-smart-chain-token-bridge-hack/",
    ],
  },
  {
    headline: "Beanstalk Farms $182M hack — Apr 2022 — governance-via-flash-loan",
    kind: "incident",
    category: "DeFi exploit",
    severity: "high",
    anonymous: true,
    body: [
      "On 17 Apr 2022, Beanstalk Farms — a credit-based stablecoin protocol — was drained of $182M via a governance vote the attacker won by holding majority stake for less than 13 seconds. Net profit to the attacker: ~$80M. The remainder was protocol liquidity consumed by the proposal payload.",
      "",
      "**Root cause.** Beanstalk's governance had an `emergencyCommit` function that allowed any super-majority Stalk holder to execute a passed proposal *immediately*, bypassing the normal review/timelock. The attacker took a $1B flash loan from Aave, converted into BEAN3CRV-f and BEAN3LUSD-f LP tokens, deposited them to claim Stalks, and crossed the 2/3 voting threshold. They then triggered `emergencyCommit` on a proposal they had submitted earlier — one disguised as a 'donate funds to Ukraine' BIP-18 — whose actual payload drained the protocol.",
      "",
      "**The architectural lesson.** Governance modules that compute voting power against current balances, without flash-loan-resistant snapshotting, are governance-attacker bait. Beanstalk's defense should have been a Compound-style snapshot at proposal-submission time — a well-known pattern that Beanstalk's governance didn't adopt because Beanstalk was a much newer protocol designed without a treasury big enough to be a flash-loan target. The protocol got big enough to be one before the snapshot mechanism caught up.",
      "",
      "**Laundering.** Attacker funds were routed through Tornado Cash. Beanstalk attempted to fundraise and resurrect the protocol post-attack; recovery has been partial.",
    ].join("\n"),
    sources: [
      "https://www.merklescience.com/blog/hack-track-analysis-of-beanstalk-flash-loan-attack",
      "https://www.coindesk.com/tech/2022/04/17/attacker-drains-182m-from-beanstalk-stablecoin-protocol",
      "https://www.certik.com/resources/blog/revisiting-beanstalk-farms-exploit",
    ],
  },
  {
    headline: "BadgerDAO $120M hack — Dec 2021 — Cloudflare API key & front-end injection",
    kind: "incident",
    category: "Front-end compromise",
    severity: "high",
    anonymous: true,
    body: [
      "Between 10 Nov and 2 Dec 2021, BadgerDAO users were silently drained for a cumulative ~$120M (~2,100 BTC + 151 ETH). One affected user lost 900 BTC alone. The contracts were never compromised — the protocol's web front end was.",
      "",
      "**Root cause.** An attacker obtained a Cloudflare API key for BadgerDAO's account, created without the security team's knowledge. With that key, they modified Cloudflare Workers routes to inject malicious JavaScript into a *subset* of user sessions — periodically, not for every visitor. The injected script rewrote ERC-20 approval prompts: where users thought they were approving Badger Vaults to spend their tokens, they were actually approving an attacker-controlled address for an unlimited allowance. Once approved, the attacker swept on their own schedule.",
      "",
      "**Why it matters.** BadgerDAO is the canonical 'your contracts can be audit-pristine and you can still die' incident. Every web2 attack surface that delivers signed transactions to your users — CDN, DNS, the wallet-connect modal vendor, the analytics script — is now part of your protocol's threat model. Several DeFi protocols moved to IPFS-pinned or content-hash-verified front ends specifically in response.",
      "",
      "**Aftermath.** Most affected users were ultimately compensated via a DAO-funded restitution program. The Cloudflare API-key origin (unauthorized creation, no monitoring) remains the most-cited security-ops lesson from the incident.",
    ].join("\n"),
    sources: [
      "https://www.halborn.com/blog/post/explained-the-badgerdao-hack-december-2021",
      "https://www.coindesk.com/business/2021/12/10/badgerdao-reveals-details-of-how-it-was-hacked-for-120m",
      "https://www.chainalysis.com/blog/chainalysis-podcast-episode-6-badgerdao-hack/",
    ],
  },
  {
    headline: "KuCoin $281M hack — Sep 2020 — Lazarus exchange drain, 84% recovered",
    kind: "incident",
    category: "Exchange hack",
    severity: "critical",
    anonymous: true,
    body: [
      "On 26 Sep 2020, attackers drained ~$281M from KuCoin's hot wallets across BTC, ERC-20s, and other tokens. It was the largest crypto exchange hack of 2020 and the third-largest of all time at that point. Chainalysis later attributed it to Lazarus Group.",
      "",
      "**Root cause.** Per CEO Johnny Lyu's disclosure: private keys to multiple KuCoin hot wallets were exfiltrated from the exchange's internal systems. The specific initial-access vector was not publicly disclosed, but the laundering pattern matches the Lazarus playbook seen across the cluster's 2020-2021 campaigns (selling stolen ERC-20s on Uniswap and other DEXs for ETH, then mixing).",
      "",
      "**The recovery.** KuCoin's response is the highest-leverage clawback case study in crypto history: 78% recovered through coordinated freezes with other exchanges and project teams (token issuers reissued stolen tokens with the attacker addresses blacklisted), 6% recovered via law enforcement, 16% covered by KuCoin's insurance fund — 100% restitution to users. The aggressive issuer-coordinated reissue tactic for ERC-20s was novel at the time and has since become a standard play after major exchange hacks.",
      "",
      "**Why it matters.** KuCoin is the rare incident where a fast, well-coordinated clawback dramatically reduced final losses — proving the upper bound on what's possible when exchange ops, issuer cooperation, and law enforcement all align in the first 72 hours. The Chainalysis writeup of Lazarus's DEX-laundering pivot during this incident also marked the cluster's documented shift toward DeFi-based laundering.",
    ].join("\n"),
    sources: [
      "https://www.chainalysis.com/blog/lazarus-group-kucoin-exchange-hack/",
      "https://www.chainalysis.com/blog/kucoin-hack-2020-defi-uniswap/",
      "https://hacken.io/insights/kucoin-september-2020-hack-hacken-research/",
    ],
  },
  {
    headline: "Mango Markets $114M exploit — Oct 2022 — Avi Eisenberg, oracle manipulation, conviction & vacatur",
    kind: "incident",
    category: "DeFi exploit",
    severity: "high",
    anonymous: true,
    body: [
      "On 11 Oct 2022, Avraham 'Avi' Eisenberg drained $114M from Solana-based DEX Mango Markets in three coordinated trades. He publicly identified himself, called the action a 'highly-profitable trading strategy,' and entered restitution negotiations with the DAO. The legal story has since stretched into 2025 with multiple twists.",
      "",
      "**Root cause.** Eisenberg used two coordinated accounts to pump the price of MNGO perpetual futures on Mango by ~1000% in a single coordinated trade sequence. With the artificially-inflated MNGO marked-to-market as collateral, his account passed Mango's solvency check for a $110M+ borrow against the inflated collateral. He withdrew the borrowed assets across BTC, USDC, USDT, MNGO, SOL, and others before the oracle could re-price.",
      "",
      "**Legal aftermath.** Sentenced in Apr 2024 for commodities fraud and market manipulation — the first US conviction in a DeFi market-manipulation case. Faced up to 20 years. Then on 23 May 2025, US District Judge Arun Subramanian *vacated* all criminal convictions on a Rule 29 acquittal motion, finding the government had not proven Mango Markets met the statutory definition of a 'commodity' under CFTC jurisdiction. Eisenberg remains separately convicted on unrelated child-abuse-material charges (4-year sentence).",
      "",
      "**Why it matters.** Mango is the load-bearing case for two open questions: (1) where the legal line falls between 'highly profitable trading' and 'fraud' in DeFi (the vacatur sharpened it but did not settle it), and (2) what oracle-design defenses look like (snapshot oracles, TWAP windows, manipulation-resistance constants) — every Solana perpetuals venue post-Mango uses some variant.",
    ].join("\n"),
    sources: [
      "https://www.coindesk.com/policy/2024/04/18/mango-markets-exploiter-avi-eisenberg-found-guilty-of-fraud-and-manipulation",
      "https://www.trmlabs.com/resources/blog/breaking-federal-judge-overturns-all-criminal-convictions-in-mango-markets-case-against-avraham-eisenberg",
      "https://www.cftc.gov/PressRoom/PressReleases/8647-23",
    ],
  },
];

async function upsert(payload: IntelPayload) {
  const existing = await db
    .select({ id: submissions.id, publicId: submissions.publicId })
    .from(submissions)
    .where(
      and(
        eq(submissions.type, "intel"),
        sql`${submissions.payload}->>'headline' = ${payload.headline}`,
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    const [row] = await db
      .update(submissions)
      .set({
        payload,
        status: "approved",
        publishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(submissions.id, existing[0].id))
      .returning({ publicId: submissions.publicId });
    return { action: "updated" as const, publicId: row.publicId };
  }
  const [row] = await db
    .insert(submissions)
    .values({
      type: "intel",
      status: "approved",
      payload,
      publishedAt: new Date(),
    })
    .returning({ publicId: submissions.publicId });
  return { action: "inserted" as const, publicId: row.publicId };
}

async function main() {
  let inserted = 0;
  let updated = 0;
  for (const it of incidents) {
    const withPersonas: IntelPayload = {
      ...it,
      personas: it.personas ?? INCIDENT_DEFAULT_PERSONAS,
    };
    const r = await upsert(withPersonas);
    if (r.action === "inserted") inserted++;
    else updated++;
    console.log(
      `  ${r.action.padEnd(8)} /intel/${r.publicId}  ${withPersonas.headline}`,
    );
  }
  console.log(
    `\n✓ ${incidents.length} incidents processed (${inserted} new, ${updated} updated).`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
