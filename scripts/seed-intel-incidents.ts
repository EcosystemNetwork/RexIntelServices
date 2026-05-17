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
    const r = await upsert(it);
    if (r.action === "inserted") inserted++;
    else updated++;
    console.log(
      `  ${r.action.padEnd(8)} /intel/${r.publicId}  ${it.headline}`,
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
