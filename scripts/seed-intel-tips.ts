/**
 * Run with: npx tsx scripts/seed-intel-tips.ts
 *
 * Seeds /intel with kind="tip" rows — short, scannable community-style
 * sightings: active scam infra, drainer services, sanctioned clusters,
 * phishing patterns to watch. Each tip is short (3-6 paragraphs) and
 * action-oriented: what to look for, what to avoid.
 *
 * Curation rule: every tip cites at least one publicly-verifiable source.
 * No fabricated addresses; addresses included only where they appear in
 * the cited source (OFAC SDN list, FinCEN actions, etc.).
 *
 * Idempotent: matches on payload->>'headline'.
 */
import "dotenv/config";
import { and, eq, sql } from "drizzle-orm";
import { db, submissions } from "../src/lib/db";
import type { IntelPayload } from "../src/lib/db/schema";

const tips: IntelPayload[] = [
  {
    headline: "Inferno Drainer is back online — $215M+ taken, 200k+ victims",
    kind: "tip",
    category: "Drainer-as-a-service",
    severity: "high",
    anonymous: true,
    body: [
      "Inferno Drainer — the phishing-as-a-service platform that powered most 'connect wallet'-style theft in 2023 — closed up shop in Nov 2023 and reopened in May 2024. Most prominent recent loss: a $32M permit-signature drain on a single wallet on 28 Sep 2024.",
      "",
      "Lifetime numbers (publicly tracked by Scam Sniffer and others): $215M+ across 200k+ victims since 2022. The platform offers white-label drainer kits to affiliates in exchange for a share of proceeds — the model is identical to ransomware-as-a-service.",
      "",
      "**Watch for.** Fake airdrop sites, fake mint pages, and 'urgent wallet upgrade' prompts that ask for a permit/Permit2/setApprovalForAll signature. Any signature request from a site you reached via DM, Telegram, or sponsored search should be treated as hostile by default.",
    ].join("\n"),
    sources: [
      "https://beincrypto.com/32-million-crypto-wallet-phishing-scam/",
      "https://beincrypto.com/crypto-phishing-inferno-drainer/",
    ],
  },
  {
    headline: "Pink Drainer shut down after $85M — affiliates rotating to clones",
    kind: "tip",
    category: "Drainer-as-a-service",
    severity: "medium",
    anonymous: true,
    body: [
      "Pink Drainer's operators announced shutdown in May 2024 after extracting ~$85M from ~20k victims. As with Inferno's 2023 'shutdown,' Pink affiliates are reportedly rotating to successor kits — Angel Drainer, Venom Drainer, and a long tail of clones have absorbed the operator pool.",
      "",
      "**Watch for.** The phishing surfaces don't disappear when an operator brand sunsets — they rebrand. Signature-request patterns to be alert to are unchanged: malicious `permit`, `Permit2`, `setApprovalForAll`, and the newer `transferFrom` exploit on freshly-approved token allowances.",
    ].join("\n"),
    sources: [
      "https://dailycoin.com/crypto-industry-relieved-as-wallet-drainer-bites-the-dust/",
    ],
  },
  {
    headline: "Address poisoning cost a single wallet $50M USDT in Dec 2025",
    kind: "tip",
    category: "Address poisoning",
    severity: "high",
    anonymous: true,
    body: [
      "On 20 Dec 2025, a crypto trader sent $49,999,950 USDT to a poisoned address that matched the legitimate recipient on the first 5 and last 4 characters. Attacker used the dust-attack pattern: a small inbound transaction from a vanity address that the victim then copy-pasted from their history.",
      "",
      "Laundering chain: the attacker swapped USDT → DAI within 30 minutes (USDT can be frozen by Tether; DAI cannot), then DAI → ~16,690 ETH, then deposited ~16,680 ETH into Tornado Cash.",
      "",
      "**Pattern.** Chainalysis attributes >10% of 2025 wallet drains to address poisoning. The defense is the boring one: full address comparison, not abbreviated middle-ellipsis comparison; address-book entries, not history pulls; for institutional-size transfers, a $1 test transaction and out-of-band confirmation of the destination.",
    ].join("\n"),
    sources: [
      "https://www.coindesk.com/web3/2025/12/20/crypto-user-loses-usd50-million-in-address-poisoning-scam",
      "https://www.theblock.co/post/383423/crypto-trader-loses-50-million-in-address-poisoning-attack-offers-1-million-bounty-for-return",
    ],
  },
  {
    headline: "Huione Group designated by FinCEN — primary money-laundering concern",
    kind: "tip",
    category: "Off-ramp",
    severity: "high",
    anonymous: true,
    body: [
      "FinCEN designated Cambodia-based Huione Group a 'foreign financial institution of primary money laundering concern' under USA PATRIOT Act §311 in May 2025; the rule was finalized in Oct 2025, cutting Huione off from the US financial system. Elliptic's research preceded the action.",
      "",
      "**The scale.** Huione Guarantee, the group's online marketplace, processed at least $27B in transactions — the largest illicit online marketplace ever. Group entities have received $98B+ in crypto. The platform sells: scam-site templates for pig-butchering operations, harvested personal data, and laundering services. FinCEN's investigation found Huione laundered $4B+ between Aug 2021 and Jan 2025.",
      "",
      "**Watch for.** Funds rotating through Huione's stablecoin (USDH, launched 2024-2025) or Huione-affiliated OTC desks. Any counterparty whose ultimate destination is a Huione-linked address is a sanctions-risk red flag under the May 2025 rule.",
    ].join("\n"),
    sources: [
      "https://www.elliptic.co/blog/the-u.s.-treasury-finds-huione-group-to-be-of-primary-money-laundering-concern",
      "https://www.fincen.gov/news/news-releases/fincen-finds-cambodia-based-huione-group-be-primary-money-laundering-concern",
    ],
  },
  {
    headline: "OFAC-sanctioned Ronin attacker address — still tracked, still flagged",
    kind: "tip",
    category: "Sanctioned address",
    severity: "high",
    anonymous: true,
    body: [
      "The Ethereum address `0x098B716B8Aaf21512996dC57EB0615e2383E2f96` was added to OFAC's SDN list on 14 Apr 2022 as the primary recipient of the Ronin Bridge theft. Treasury identified the owner as Lazarus Group. The address has been a permanent reference point on virtually every public crypto sanctions screening list since.",
      "",
      "**Why it still matters.** Even with most funds moved on, the address remains the canonical 'Lazarus-attributed' entry on commercial screening lists. Counterparty linkage to this address (any path through related clusters) is a sanctions-exposure trigger that most compliance programs treat as a hard block.",
      "",
      "**Read on.** The Tayvano Lazarus/BlueNoroff research repository on GitHub is the highest-fidelity public tracker of related clusters.",
    ].join("\n"),
    sources: [
      "https://cyberscoop.com/ronin-bridge-hack-lazarus-group-north-korea-treasury-sanctions/",
      "https://github.com/tayvano/lazarus-bluenoroff-research/blob/main/hacks-and-thefts/ronin_bridge.md",
    ],
    links: [
      "https://etherscan.io/address/0x098B716B8Aaf21512996dC57EB0615e2383E2f96",
    ],
  },
  {
    headline: "MetaMask 'Happy New Year' upgrade phish — active drainer, 2026",
    kind: "tip",
    category: "Phishing campaign",
    severity: "medium",
    anonymous: true,
    body: [
      "ZachXBT flagged an active phishing campaign distributing emails styled as 'mandatory MetaMask upgrade' notices around the New Year 2026 window. Branding includes a party-hat fox logo and a 'Happy New Year!' subject line. The link delivers a drainer that requests broad token approvals on click.",
      "",
      "**Pattern.** MetaMask does not push mandatory upgrades via email. Any wallet-software 'upgrade required' notice arriving by email or DM should be treated as a phish. The legit update path is the wallet's own update banner inside the extension.",
    ].join("\n"),
    sources: [
      "https://beincrypto.com/multi-chain-crypto-wallet-drain-phishing-exploit/",
      "https://cryptoslate.com/hundreds-of-evm-wallets-drained-what-to-check-before-you-update/",
    ],
  },
  {
    headline: "Telegram 'former contractor with a PDF' lure — the Radiant pattern",
    kind: "tip",
    category: "Social engineering",
    severity: "critical",
    anonymous: true,
    body: [
      "Radiant Capital's $50M loss (Oct 2024) began with a Telegram message from someone impersonating a former contractor, sharing a ZIP containing a PDF + INLETDRIFT macOS backdoor. Same kill chain has been observed against multiple DeFi teams since.",
      "",
      "**Watch for.** Inbound Telegram from a 'known' name with an attachment — even from a verified handle, even from a contact you genuinely worked with. The handle and avatar can be spoofed; the file is the payload. Treat any unexpected ZIP / PDF / DMG from Telegram as adversarial. For teams with multisig signing duties, the practical rule is: never open attachments on the same machine as the signing keys.",
    ].join("\n"),
    sources: [
      "https://decrypt.co/295545/radiant-capital-says-dprk-actor-posed-as-ex-contractor-to-pull-off-50-million-hack",
      "https://therecord.media/radiant-capital-heist-north-korea",
    ],
  },
  {
    headline: "LinkedIn 'pre-employment test' Python scripts — the DMM / Ginco vector",
    kind: "tip",
    category: "Social engineering",
    severity: "critical",
    anonymous: true,
    body: [
      "DMM Bitcoin's $305M loss (May 2024) began with a Ginco engineer being asked to run a 'pre-employment test' Python script from GitHub. The script was malware; Ginco was DMM's wallet-software vendor; DMM was the eventual victim. Mandiant has tracked the same playbook (JumpCloud 2023, 3CX 2023, others).",
      "",
      "**Watch for.** Recruiter outreach via LinkedIn that escalates quickly to a take-home coding challenge or 'quick technical assessment' delivered as a script from a personal GitHub. Real employers send links to a structured test platform (HackerRank, Codility, an internal CI) — not to a bare repo. Never execute an interview-task script on a machine that has SSH keys, wallet software, or production VPN credentials.",
    ].join("\n"),
    sources: [
      "https://thehackernews.com/2024/12/north-korean-hackers-pull-off-308m.html",
      "https://www.merklescience.com/blog/hack-track-dmm-flow-of-funds-analysis",
    ],
  },
  {
    headline: "Garantex remains the dominant Russian off-ramp for sanctioned funds",
    kind: "tip",
    category: "Off-ramp",
    severity: "high",
    anonymous: true,
    body: [
      "Garantex, the Russia-domiciled exchange OFAC sanctioned in Apr 2022, remains a primary off-ramp for North Korean and Russia-aligned criminal flows. Elliptic's Atomic Wallet trace identified Garantex as a major laundering venue for the 2023 Atomic Wallet heist proceeds.",
      "",
      "**Watch for.** Counterparty exposure to Garantex is a binary sanctions block under OFAC. EU sanctioned the exchange in Feb 2024. Compliance programs should screen at multiple hops, not just direct counterparty — Garantex sits at the end of long laundering chains specifically to obscure the linkage.",
    ].join("\n"),
    sources: [
      "https://www.elliptic.co/blog/analysis/north-korea-linked-atomic-wallet-heist-tops-100-million",
    ],
  },
  {
    headline: "Permit2 exploits — the 2024-2025 silent killer",
    kind: "tip",
    category: "Phishing pattern",
    severity: "high",
    anonymous: true,
    body: [
      "Uniswap's Permit2 contract — a single approval-router on every EVM chain — is now the dominant attack surface for drainer kits. A single victim signature against a Permit2 phishing payload can authorize transfers of every token the victim has *ever* approved through any Permit2-integrated protocol, often with a multi-year validity window.",
      "",
      "**Why it's worse than legacy approvals.** Old `setApprovalForAll` phish drains one token contract. A Permit2 phish drains every Permit2-integrated token allowance the victim holds.",
      "",
      "**Defense.** Periodically review and revoke Permit2 allowances (Revoke.cash and similar tools surface them). Treat any signature request that mentions Permit2 or `PermitTransferFrom` from a site you don't fully trust as hostile.",
    ].join("\n"),
    sources: [
      "https://www.coindesk.com/web3/2025/12/20/crypto-user-loses-usd50-million-in-address-poisoning-scam",
    ],
  },
  {
    headline: "Fake Zoom / Calendly invites with malicious download prompts",
    kind: "tip",
    category: "Social engineering",
    severity: "medium",
    anonymous: true,
    body: [
      "Active 2024-2025 campaign targeting crypto founders and operators: a 'VC partner' or 'reporter' books a video call. Minutes before the call, the target receives a 'Zoom is asking you to update' or 'install our meeting client' prompt. The installer is malware (typically RustDoor or BeaverTail macOS variants on the DPRK side; commodity Windows infostealers on the cybercrime side).",
      "",
      "**Watch for.** Real Zoom updates come from inside Zoom. Real Calendly meetings don't require a download. Pre-call 'install this' prompts on a meeting you didn't initiate are the lure. The fastest tell: a meeting link routed through an unfamiliar domain (e.g., `meet-zoom.com`, `zoomvideo.io`, `calendlyworkspace.app`) rather than `zoom.us` / `calendly.com`.",
    ].join("\n"),
    sources: [
      "https://thehackernews.com/2024/12/north-korean-hackers-pull-off-308m.html",
    ],
  },
  {
    headline: "Discord 'support ticket' DMs and the Collab.Land impostor pattern",
    kind: "tip",
    category: "Phishing pattern",
    severity: "medium",
    anonymous: true,
    body: [
      "Generic Discord phishing: a 'support' bot DMs you about a 'ticket' or 'verification' for a project you're in. Click leads to a fake Collab.Land or fake Carl-bot verification flow asking for a wallet signature. The signature is a permit or approval.",
      "",
      "**Pattern.** No legitimate Discord bot DMs users unprompted. No legitimate verification requires a transaction signature. If you must verify wallet ownership for a project, do it from the project's own site, accessed via a bookmark, not via any link from a DM.",
    ].join("\n"),
    sources: [
      "https://beincrypto.com/multi-chain-crypto-wallet-drain-phishing-exploit/",
    ],
  },
  {
    headline: "Sinbad sanctioned (2023) — successor mixer rotation still active",
    kind: "tip",
    category: "Sanctioned mixer",
    severity: "medium",
    anonymous: true,
    body: [
      "Treasury sanctioned the Sinbad Bitcoin mixer in Nov 2023, attributing it as a successor to Blender.io (sanctioned May 2022) and a major laundering venue for Lazarus. Sinbad's takedown forced flows back into CoinJoin-style services and to the now-shuttered eXch.",
      "",
      "**Watch for.** Sinbad-cluster historical exposure remains a screening flag — most compliance providers keep the Sinbad-related address graph live. New mixers continue to launch and operate in the gap; the operational tempo is roughly 6-12 months between a mixer's launch and its first major sanctions/enforcement event.",
    ].join("\n"),
    sources: [
      "https://www.chainalysis.com/blog/crypto-hacking-stolen-funds-2026/",
    ],
  },
  {
    headline: "THORChain is the new default cross-chain laundering hop",
    kind: "tip",
    category: "Laundering pattern",
    severity: "medium",
    anonymous: true,
    body: [
      "Across the major 2024-2025 Lazarus-attributed incidents (DMM Bitcoin, Bybit, WazirX), THORChain — a permissionless cross-chain DEX — appears as a consistent intermediate hop, especially for BTC → ETH and BTC → AVAX rotations. The protocol has no KYC and processes large volumes that obscure individual flows.",
      "",
      "**Watch for.** A counterparty whose recent on-chain history shows large THORChain swaps shortly after receiving funds from a flagged address. THORChain itself is not sanctioned, but its appearance in a transaction graph following a known-bad inbound is a strong proxy for laundering intent. Several compliance providers now treat THORChain swaps as a flag-elevating signal in their risk scoring.",
    ].join("\n"),
    sources: [
      "https://www.merklescience.com/blog/hack-track-dmm-flow-of-funds-analysis",
      "https://www.trmlabs.com/resources/blog/the-bybit-hack-following-north-koreas-largest-exploit",
    ],
  },
  {
    headline: "Pig butchering rings are professionalizing — $11B through Huione alone",
    kind: "tip",
    category: "Pig butchering",
    severity: "high",
    anonymous: true,
    body: [
      "Elliptic's research and FinCEN's designation identified Huione Group as the primary marketplace serving SE Asia pig-butchering operations. CoinDesk's coverage of the Elliptic report tagged wallets linked to global scams receiving $11B+ through Huione Guarantee alone.",
      "",
      "**Watch for.** Romance/investment-scam victims usually report a series of small-then-large deposits to a 'broker' platform that disappears. The proceeds often flow through Tron USDT corridors and end up at Huione-affiliated or Tron-OTC desks. Recovery is rare; the highest-leverage intervention is early — most victims have a 30-60 day window where stop-deposit interventions through their bank can still prevent the largest withdrawals.",
    ].join("\n"),
    sources: [
      "https://www.elliptic.co/blog/cyber-scam-marketplace",
      "https://www.coindesk.com/policy/2024/07/10/cambodias-huione-guarantee-enables-global-scams-worth-11-billion-report",
    ],
  },
  {
    headline: "Fake hardware wallet seed-phrase prompts on package inserts",
    kind: "tip",
    category: "Supply chain",
    severity: "medium",
    anonymous: true,
    body: [
      "Active scam pattern: counterfeit Ledger / Trezor devices, or genuine devices with tampered packaging, ship with a 'scratch off to reveal your seed phrase' card. Anyone who scratches it has just been handed an attacker's pre-known seed — every coin sent to addresses derived from that seed flows to the attacker.",
      "",
      "**Watch for.** Real hardware wallets never ship with a pre-set seed phrase. The seed is generated by the device on first power-up. If a 'starter' wallet card comes with a seed in the box, the unit is compromised regardless of how legit the packaging looks. Buy direct from the manufacturer; verify packaging tamper-seals before opening.",
    ].join("\n"),
    sources: [
      "https://beincrypto.com/multi-chain-crypto-wallet-drain-phishing-exploit/",
    ],
  },
  {
    headline: "Solana 'token drainer' wallet-connect approval scams",
    kind: "tip",
    category: "Phishing pattern",
    severity: "medium",
    anonymous: true,
    body: [
      "EVM drainer playbooks have been ported to Solana. The signature surface is different — Solana doesn't have `permit` — but the result is the same: a malicious site requests a transaction that, when signed, transfers SPL token balances or sets up a delegated-authority that the attacker drains over subsequent transactions.",
      "",
      "**Watch for.** 'Connect wallet to claim' or 'connect to mint' flows on Solana that immediately produce a signature request *before* you've taken any actual action. Phantom and Solflare both surface a 'this transaction transfers your tokens' warning; if you see that warning on a 'claim' / 'mint' flow, abort.",
    ].join("\n"),
    sources: [
      "https://beincrypto.com/multi-chain-crypto-wallet-drain-phishing-exploit/",
    ],
  },
  {
    headline: "Sponsored Google ads for wallet downloads — the 2024-2025 vector",
    kind: "tip",
    category: "Phishing pattern",
    severity: "medium",
    anonymous: true,
    body: [
      "Throughout 2024-2025, sponsored Google search results for 'MetaMask download,' 'Phantom wallet,' 'Ledger Live,' and similar terms have repeatedly served malicious lookalike domains above the legitimate result. Each cycle gets a few weeks of life before Google takedown; the next attacker rotates in.",
      "",
      "**Defense.** Bookmark wallet-download URLs. Never download a wallet via search results, especially not via the sponsored result. The legit domains are well-known: `metamask.io`, `phantom.app`, `ledger.com`, `trezor.io`.",
    ].join("\n"),
    sources: [
      "https://cryptoslate.com/hundreds-of-evm-wallets-drained-what-to-check-before-you-update/",
    ],
  },
  {
    headline: "Token approval reviews — the highest-ROI 5 minutes you'll spend",
    kind: "tip",
    category: "Defense",
    severity: "low",
    anonymous: true,
    body: [
      "Most drainer-extracted losses are not from one signature — they're from old approvals that the user forgot existed. Every token approval granted to a DeFi protocol persists on-chain until revoked. Compromised contracts (or the rare case of a legit team going rogue) can then drain every wallet that approved them.",
      "",
      "**Action.** Revoke.cash, Etherscan's Token Approval Checker, or your wallet's built-in approval manager. Once a quarter, walk through every active approval and revoke anything you no longer use. Pay attention to unlimited-allowance approvals — those are the ones drainer post-exploits in compromised protocols cash out.",
    ].join("\n"),
    sources: [
      "https://www.chainalysis.com/blog/crypto-hacking-stolen-funds-2026/",
    ],
  },
  {
    headline: "DPRK fake-recruiter pattern on X / Twitter — new variant",
    kind: "tip",
    category: "Social engineering",
    severity: "high",
    anonymous: true,
    body: [
      "Variant of the LinkedIn DPRK recruiter pattern observed on X / Twitter through 2025: a 'crypto VC analyst' or 'protocol talent partner' account DMs developers at active protocols, offering a paid 'technical assessment.' The pattern is identical to the LinkedIn version, the venue is just different.",
      "",
      "**Tells.** The account is usually 6-12 months old, has 1-5k followers (often bought), follows a heterogeneous list that includes real crypto VCs (mass-follow padding), and lists a 'job' at a fund that doesn't show this person on their site. Any technical-assessment payload — script, Notion link, take-home repo — should be treated as adversarial until proven otherwise.",
    ].join("\n"),
    sources: [
      "https://thehackernews.com/2024/12/north-korea-linked-hackers-steal-202.html",
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
  for (const it of tips) {
    const r = await upsert(it);
    if (r.action === "inserted") inserted++;
    else updated++;
    console.log(
      `  ${r.action.padEnd(8)} /intel/${r.publicId}  ${it.headline}`,
    );
  }
  console.log(
    `\n✓ ${tips.length} tips processed (${inserted} new, ${updated} updated).`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
