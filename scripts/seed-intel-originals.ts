/**
 * Run with: npx tsx scripts/seed-intel-originals.ts
 *
 * Seeds /intel with in-house original briefings — short analytical pieces
 * that synthesize across multiple incidents. These are the rows that
 * satisfy the editorial-bar guard on the weekly draft-digest cron
 * (DIGEST_BYPASS_EDITORIAL_BAR off → digest skips unless ≥1 kind=original
 * or kind=incident exists for the period).
 *
 * Curation rule: every original states a thesis up front, cites the
 * primary research it draws from, and ends with a "so what" — a piece of
 * actionable signal for someone defending a protocol, exchange, or
 * institutional treasury.
 *
 * Idempotent: matches on payload->>'headline'.
 */
import "dotenv/config";
import { and, eq, sql } from "drizzle-orm";
import { db, submissions } from "../src/lib/db";
import type { IntelPayload } from "../src/lib/db/schema";
import type { PersonaSlug } from "../src/lib/personas";

// Original analytical pieces speak primarily to investigators (the readers
// most likely to act on synthesis), compliance (AML signal), and fund-risk
// (treasury / exchange exposure inference). Individual rows may override.
const ORIGINAL_DEFAULT_PERSONAS: PersonaSlug[] = [
  "investigator",
  "compliance",
  "fund-risk",
];

const originals: IntelPayload[] = [
  {
    headline: "DPRK took $2B in crypto in 2025 — the playbook has changed",
    kind: "original",
    category: "Threat intel",
    severity: "high",
    anonymous: true,
    body: [
      "Chainalysis's 2026 Crypto Crime preview puts the DPRK haul at $2.02B for 2025 — a single-year record, ~60% of the $3.4B global theft total, and a 51% YoY jump even as the *number* of attributed incidents fell 74%. The all-time DPRK total now stands at $6.75B.",
      "",
      "**The shift, plainly.** Lazarus and adjacent clusters (BlueNoroff, UNC4736 / Citrine Sleet, TraderTraitor / UNC4899) used to spray. They are now patient. Three observations from the 2024-2025 incident set:",
      "",
      "1. **Fewer, larger.** Bybit alone (~$1.5B) is most of the 2025 number. WazirX (~$235M), DMM Bitcoin (~$305M), Radiant ($50M), Munchables ($62M) — every top-tier 2024-2025 attribution involved months of pre-positioning.",
      "2. **Endpoint-first, contract-last.** None of the top-five attributed incidents in this window exploited a smart-contract bug. Every one of them compromised a *human* — a signer (Bybit, WazirX), a contractor (Radiant, Munchables), a vendor employee (DMM via Ginco).",
      "3. **Laundering opsec is now adversarial.** Chainalysis observes a 45-day default laundering cycle and tranches consistently below $500k — well-tuned to defeat the heuristics most monitoring tools published in 2022-2023.",
      "",
      "**Why it matters.** The architectural advice that mattered in 2022 (audit your contracts, decentralize your validators) is now necessary but no longer sufficient. Every institution moving size in crypto is one phished engineer or one compromised vendor away from a Bybit-shaped event. Endpoint hardening, signer-machine isolation, and out-of-band transaction verification have moved from 'nice to have' to perimeter.",
      "",
      "**So what.** If you operate a multi-sig or custody flow, the highest-leverage question for the next 12 months is not 'are our contracts audited' but 'can a signer be tricked into approving a payload that diverges from what their UI shows?' If the answer involves trusting a single piece of vendor software end-to-end, you're inside the 2025 risk envelope.",
    ].join("\n"),
    sources: [
      "https://www.chainalysis.com/blog/crypto-hacking-stolen-funds-2026/",
      "https://www.coindesk.com/business/2025/12/18/north-korean-hackers-stole-a-record-usd2b-of-crypto-in-2025-chainalysis-says",
      "https://thehackernews.com/2025/12/north-korea-linked-hackers-steal-202.html",
    ],
  },
  {
    headline: "Post-Tornado Cash: where DPRK launders now",
    kind: "original",
    category: "Laundering analysis",
    severity: "medium",
    anonymous: true,
    body: [
      "The Fifth Circuit's Nov 2024 ruling that immutable smart contracts cannot be 'property' under IEEPA forced OFAC's hand. On 21 Mar 2025, Treasury formally delisted Tornado Cash. The mixer is again legally usable in the US (with caveats — sanctioned individuals and criminal proceeds are still off-limits).",
      "",
      "**Did Lazarus rush back?** No. The 2024-2025 incident set shows the cluster routing through a stack that no longer leans on any single venue. The pattern across Bybit, DMM, WazirX, and the secondary Atomic Wallet flows looks like this:",
      "",
      "1. **First hop:** cross-chain bridges (THORChain in particular) to break the chain-level paper trail.",
      "2. **Second hop:** privacy mixers — but a portfolio. eXch (recently shuttered), Sinbad (sanctioned 2023), Wasabi-style CoinJoins, and yes, intermittently Tornado Cash post-delisting.",
      "3. **Off-ramp:** Russia-domiciled Garantex (the Atomic Wallet route) and increasingly the Southeast Asian marketplace Huione Guarantee, which Chainalysis now treats as one of the dominant criminal off-ramps in the region.",
      "",
      "**The 45-day cycle.** Across the 2025 incident set, Chainalysis observes a consistent ~45-day window between initial theft and final cash-out, with most movements in sub-$500k tranches. This is not technological — it is organizational. DPRK clusters appear to be deliberately slow-walking funds to defeat the speed-based monitoring heuristics that worked against the 2022 Ronin and Atomic Wallet flows.",
      "",
      "**So what.** Two implications for defenders. (1) Address blocklists are necessary but produce most of their value in the first 7-10 days post-incident — by week 6 the funds are diffused enough that allow-list logic is more productive than block-list logic. (2) Bridge-level monitoring (THORChain in particular) and SEA off-ramp monitoring (Huione) are now higher-signal than mixer-level monitoring for tracking active DPRK flows.",
    ].join("\n"),
    sources: [
      "https://www.chainalysis.com/blog/crypto-hacking-stolen-funds-2026/",
      "https://www.mayerbrown.com/en/insights/publications/2024/12/federal-appeals-court-tosses-ofac-sanctions-on-tornado-cash-and-limits-federal-governments-ability-to-police-crypto-transactions",
      "https://www.elliptic.co/blog/analysis/north-korea-linked-atomic-wallet-heist-tops-100-million",
    ],
  },
  {
    headline: "The DPRK IT-worker infiltration kill chain — Munchables, Radiant, DMM",
    kind: "original",
    category: "Threat intel",
    severity: "high",
    anonymous: true,
    body: [
      "Three of the largest 2024 incidents — Munchables ($62M, Mar 2024), Radiant ($50M, Oct 2024), DMM Bitcoin ($305M, May 2024) — share a kill chain that did not exist as a documented pattern in the 2022 incident set. The TLDR: hire a 'developer,' wait, drain.",
      "",
      "**Stage 1 — placement.** Operators submit polished CVs and portfolios to crypto teams hiring engineering or smart-contract contractors. ZachXBT's Munchables investigation revealed that all four engineers Munchables had brought on were almost certainly the same operator under different identities, all DPRK-aligned. The 2024 US Treasury advisories on DPRK IT workers describe placement as 'thousands of operators dispersed globally' working through fronts in China, Russia, and SE Asia.",
      "",
      "**Stage 2 — patient build.** The operator ships real, working code. Audits pass. The team builds trust. Either the operator inserts an upgrade path or backdoor they alone can later weaponize (Munchables pattern), or they harvest enough access to compromise other team members downstream (Radiant pattern via Telegram impersonation of a known-good ex-contractor with a malware PDF).",
      "",
      "**Stage 3 — drain.** The drain is fast and coordinated. The pre-existing simulation tests pass because the staged transactions are crafted to do so. The operator either signs the malicious transaction themselves (insider), or triggers it through compromised signer machines (long-dwell).",
      "",
      "**The DMM variant — upstream supply chain.** DMM Bitcoin shows the pattern can climb the dependency tree: the Lazarus operator who compromised DMM was placed at *Ginco*, DMM's wallet-software vendor. Mandiant traced the entry to a fake LinkedIn recruiter pitching a 'pre-employment test' Python script. The same playbook is documented in JumpCloud (2023) and 3CX (2023).",
      "",
      "**So what.** If your team is hiring smart-contract engineers, signing partners, or wallet-software contractors, the threat model now includes the engineer themselves. (1) Insist on in-person ID verification or notarized identity attestation for credentials granting signer access. (2) Make video-on-camera mandatory in technical interviews. (3) Build the assumption that any single contributor could be hostile into the upgrade-permissions model — no single insider should have a path from 'in the repo' to 'controls treasury funds.'",
    ].join("\n"),
    sources: [
      "https://www.coindesk.com/tech/2024/03/27/munchables-exploited-for-62m-ether-linked-to-rogue-north-korean-team-member",
      "https://thehackernews.com/2024/12/north-korean-hackers-pull-off-308m.html",
      "https://decrypt.co/295545/radiant-capital-says-dprk-actor-posed-as-ex-contractor-to-pull-off-50-million-hack",
    ],
  },
  {
    headline: "Sign-blind multisigs — why Bybit and WazirX look identical",
    kind: "original",
    category: "Architecture analysis",
    severity: "critical",
    anonymous: true,
    body: [
      "The two largest single-event exchange losses of 2024-2025 — WazirX ($235M, Jul 2024) and Bybit ($1.5B, Feb 2025) — share a failure mode subtle enough that neither team's pre-incident threat model accounted for it. Both were multi-sig drains, and in both cases the cryptography was not broken. The *interface* was.",
      "",
      "**The pattern.** A multi-sig signer receives a transaction in a hosted UI. The UI parses the transaction's calldata and shows the signer a friendly summary: 'Transfer 1,000 USDC to 0x...'. The signer reviews the summary, sees no anomalies, signs.",
      "",
      "But the UI is software. If the attacker controls the UI, the attacker controls the gap between *what the signer sees* and *what the signer's key actually signs.* In WazirX, Lazarus stood up a fake Liminal UI. In Bybit, Lazarus injected JavaScript into a legitimate vendor's signing dashboard. In both cases, multiple human signers approved transactions whose displayed semantics had nothing to do with their on-chain effect — an upgrade to a malicious implementation contract, then unbounded drain.",
      "",
      "**Why standard mitigations don't help.** Simulation tools (Tenderly et al.) caught nothing because the simulation was run against the same calldata the signer saw — which was the *fake* calldata, not the one actually broadcast. Per-signer hardware wallets caught nothing because the malicious calldata is the calldata being signed. Audits caught nothing because the contracts are not the attack surface.",
      "",
      "**What actually defeats this.** The mitigation requires breaking the trust loop at the UI. Three patterns work:",
      "1. **Out-of-band calldata verification** — a second device, on a different machine, that re-derives the human-readable transaction summary from the raw calldata and matches it against what the primary UI shows. Used by Anchorage and a handful of institutional custodians.",
      "2. **Hardware wallet with full calldata parsing** — Ledger's Clear Signing on its more recent devices renders the actual semantics of common contract calls. Useful for individual signers, less practical for institutional flows touching custom contracts.",
      "3. **Multi-party computation with adversarial UI assumption** — protocols like Fireblocks's policy engine that treat the UI as untrusted and require the signer to confirm semantic intent before the keying ceremony.",
      "",
      "**So what.** If you operate a custody flow at any size, the question is not 'can our signers be phished individually' (everyone knows they can) but 'can a signer be tricked into approving a payload that diverges from what their UI shows?' That is the load-bearing question for 2026.",
    ].join("\n"),
    sources: [
      "https://www.nccgroup.com/research/in-depth-technical-analysis-of-the-bybit-hack/",
      "https://crystalintelligence.com/investigations/expert-analysis-wazirx-hack/",
      "https://www.trmlabs.com/resources/blog/the-bybit-hack-following-north-koreas-largest-exploit",
    ],
  },
  {
    headline: "Bridges keep dying — five architectural failure modes, ranked",
    kind: "original",
    category: "Architecture analysis",
    severity: "medium",
    anonymous: true,
    body: [
      "Cross-chain bridges account for a disproportionate share of the all-time crypto-loss leaderboard: Ronin ($625M), Wormhole ($325M), Multichain ($210M), Nomad ($190M), Poly Network ($611M, mostly returned), and several smaller losses. Pooling the incident set yields five distinct root-cause shapes.",
      "",
      "**1 — Validator-set capture (Ronin, BNB Bridge).** The bridge accepts a quorum signature from a small validator set. Compromise enough validators and the bridge mints/burns at will. Ronin's 5/9 set fell to social engineering plus a stale allow-list. BNB Bridge fell to a forged IAVL Merkle proof against the same validator set design. *Fix shape:* either go ZK-proof-based (no validator set) or accept that the 'M' in M-of-N must be operationally independent — which is much harder than the architecture diagram implies.",
      "",
      "**2 — Signature-verification bypass (Wormhole, Qubit).** The bridge's mint-side contract authorizes wraps based on a signature from the burn side, and the signature verification has a primitive bug — a deprecated function, an unchecked sysvar, an unvalidated origin. *Fix shape:* battle-test the verification primitive in isolation; treat any deprecation warning in the cryptographic path as a P0.",
      "",
      "**3 — Message-proof construction (Nomad).** The bridge trusts that any message with a 'valid proof' represents authorized cross-chain action — but initializes the trusted root to a value (often 0x00 after a bad upgrade) for which crafting a valid-looking proof is trivial. *Fix shape:* never let the trusted-root initialization path coexist with the proof-acceptance path; gate one behind a long timelock and an explicit non-zero check.",
      "",
      "**4 — Off-chain key custody (Multichain, Harmony Horizon).** The bridge's signing keys live in operational infrastructure (MPC shards, cloud HSMs) controlled by a small team. The bridge dies when the *people* are compromised — arrested, phished, fired with grudge. *Fix shape:* assume any key-custody scheme that depends on a single person staying available and loyal is a single point of failure.",
      "",
      "**5 — Upgrade-path abuse (WazirX as a pseudo-bridge case).** The bridge contract is upgradeable. The upgrade authority is itself a multisig. Compromise the multisig signing flow and you don't need to find a bug — you upgrade to a malicious implementation and drain. *Fix shape:* the sign-blind multisig analysis applies. (See companion piece.)",
      "",
      "**So what.** When evaluating whether to bridge funds, the operative risk is not 'has this bridge been audited' but 'which of these five failure modes is the architecture exposed to, and what are the controls?' Most production bridges are exposed to at least two. Optimistic designs and ZK bridges narrow the surface to (2) and (5); they do not eliminate it.",
    ].join("\n"),
    sources: [
      "https://www.elliptic.co/blog/540-million-stolen-from-the-ronin-defi-bridge",
      "https://www.chainalysis.com/blog/wormhole-hack-february-2022/",
      "https://medium.com/immunefi/hack-analysis-nomad-bridge-august-2022-5aa63d53814a",
      "https://www.chainalysis.com/blog/multichain-exploit-july-2023/",
    ],
  },
  {
    headline: "Garantex — the Russian exchange that became Lazarus's off-ramp",
    kind: "original",
    category: "Sanctioned entities",
    severity: "high",
    anonymous: true,
    body: [
      "Garantex Europe OU was a Moscow-headquartered crypto exchange that, between its 2019 founding and its first OFAC designation on 5 Apr 2022, processed over $100B in transactions. Treasury at the redesignation in 2025 estimated 82% of that volume had been tied to sanctioned entities globally — making Garantex, for several years, the single largest non-DPRK exchange laundering pipe in crypto.",
      "",
      "**The OFAC designation.** Garantex was added to the SDN list as part of Treasury's 2022-04-05 cyber-related designation alongside the dark-net market Hydra. The original SDN entry includes three primary digital-currency addresses Treasury attributed to Garantex's operational infrastructure:",
      "1. **Bitcoin:** `3Lpoy53K625zVeE47ZasiG5jGkAxJ27kh1`",
      "2. **Ethereum:** `0x7FF9cFad3877F21d41Da833E2F775dB0569eE3D9`",
      "3. **Tron (TRX):** `TA1hsikRfsgGiW9nEBpT4tEXEySTNYLr2d`",
      "",
      "These addresses are SDN-listed entities — interacting with them is a US sanctions violation. They appear as counterparties in nearly every Lazarus-attributed exchange compromise documented since 2022, including the Atomic Wallet (Jun 2023) laundering trail Elliptic published. The Tron entry is operationally the most-used — USDT-on-Tron has been the dominant illicit-flow stablecoin rail since 2022, and Garantex's TRX deposit address has been the conventional final off-ramp for Russia- and DPRK-connected operators.",
      "",
      "**The 2025 redesignation.** In Aug 2025, Treasury issued a second designation against Garantex after the exchange had spent the post-2022 years operating openly under sanctions, with crypto-industry tools (notably the Tether USDT freeze function) being applied inconsistently. The redesignation came with a freeze of ~$28M in USDT on Garantex addresses and the indictment of multiple Garantex principals.",
      "",
      "**Why it matters.** Garantex is the canonical 'sanctions-evasion exchange' case for crypto compliance teams. Three operational implications:",
      "(1) Any flow that touches one of the three SDN-listed addresses above is a sanctions hit, regardless of intermediate hops. Address blocklists that don't include all three are incomplete.",
      "(2) Tron's USDT rail is the dominant 2024-2025 illicit-flow venue. If your compliance program treats Tron as a low-priority chain because volume is lower than ETH, you have a blind spot Lazarus and Russian operators are actively exploiting.",
      "(3) Sanctioned exchanges don't disappear — they migrate. After Garantex's takedown disrupted operations, successor exchanges (Grinex, TokenSpot) absorbed the flows. Address-graph monitoring of the *physical infrastructure* (datacenter IPs, operator wallets) outlasts any single brand-level enforcement action.",
    ].join("\n"),
    sources: [
      "https://ofac.treasury.gov/recent-actions/20220405",
      "https://www.chainalysis.com/blog/sanctioned-grinex-exchange-suspends-operations/",
      "https://www.trmlabs.com/resources/blog/sanctioned-russian-exchange-grinex-and-kyrgyzstani-exchange-tokenspot-hit-in-usd-15-million-theft",
    ],
  },
  {
    headline: "The 45-day laundering cycle — DPRK's new operational tempo",
    kind: "original",
    category: "Laundering analysis",
    severity: "medium",
    anonymous: true,
    body: [
      "Across the 2024-2025 Lazarus-attributed incident set, Chainalysis identifies a consistent operational pattern: ~45 days between initial theft and meaningful off-ramp activity, with onward movement in sub-$500k tranches. This is a measured slowdown from 2022, when Ronin funds began flowing into Tornado Cash within 48 hours of the breach.",
      "",
      "**Why 45 days?** Three pressures, compounding:",
      "1. **Mixer regulatory churn.** Tornado Cash sanctioned (Aug 2022) → delisted (Mar 2025); Sinbad sanctioned (Nov 2023); eXch shuttered (2025). The 2022-era 'wash through mixer, off-ramp through Russian exchange' path no longer exists as a stable pipeline; each cycle requires routing decisions.",
      "2. **Heuristic adversarialism.** TRM, Chainalysis, and Elliptic publish heuristic detail in their public reports. DPRK clusters appear to read those reports. Sub-$500k tranches sidestep the velocity-based heuristics that flagged Ronin in 2022.",
      "3. **Sanctioned-exchange capacity limits.** Garantex, Huione Guarantee, and other off-ramps cannot absorb $1B+ in a single window without exposing themselves to severance. Slow-walking the funds is a cooperative protocol with the off-ramp.",
      "",
      "**So what.** For monitoring teams, the 45-day cycle changes what 'fresh' versus 'cold' means. A wallet sitting quiet for 30 days after a major incident is not safe — it's pre-cycle. Address graphs need to retain edges and metadata for at least the cycle length to be useful for post-incident clawback work. For exchanges accepting deposits, the heightened scrutiny window after any major DPRK-attributed incident is now ~60-90 days, not the 14-30 most KYC programs were tuned for in 2022.",
      "",
      "(This piece is the methodology companion to our top-of-month report; the underlying address graph is what RexIntel is built around. Tips welcome at the /submit form — every approved address-tagged submission compounds the graph.)",
    ].join("\n"),
    sources: [
      "https://www.chainalysis.com/blog/crypto-hacking-stolen-funds-2026/",
      "https://www.trmlabs.com/resources/blog/the-bybit-hack-following-north-koreas-largest-exploit",
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
  for (const it of originals) {
    const withPersonas: IntelPayload = {
      ...it,
      personas: it.personas ?? ORIGINAL_DEFAULT_PERSONAS,
    };
    const r = await upsert(withPersonas);
    if (r.action === "inserted") inserted++;
    else updated++;
    console.log(
      `  ${r.action.padEnd(8)} /intel/${r.publicId}  ${withPersonas.headline}`,
    );
  }
  console.log(
    `\n✓ ${originals.length} originals processed (${inserted} new, ${updated} updated).`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
