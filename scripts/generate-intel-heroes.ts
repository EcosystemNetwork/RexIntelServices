/**
 * Generates typographic hero SVGs for intel articles.
 *
 * Each hero is a "stat card" — kicker + big number + label + headline +
 * subhead, in the Rex Intel terminal aesthetic. Written as static SVG files
 * under /public/intel-heroes/ so the article hero, OG card, listing
 * thumbnail, and RSS enclosure all share one asset.
 *
 * Run: npx tsx scripts/generate-intel-heroes.ts
 *
 * To add a new hero, append to the HEROES array. Re-running is idempotent
 * (overwrites existing files), so designs can be iterated in this script
 * rather than editing 7 XML blobs by hand.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

type Hero = {
  slug: string;
  kicker: string;
  statBig: string; // up to ~6 chars wide
  statLabel: string;
  headline: string;
  subhead: string;
  accent?: "green" | "red" | "amber" | "blue";
  badge?: string; // e.g. CRITICAL / HIGH
  caption?: string; // bottom-right footer line
};

const HEROES: Hero[] = [
  // ── Originals (analyst briefings) ──────────────────────────────────
  {
    slug: "dprk-2b-2025",
    kicker: "▸ ORIGINAL · THREAT INTEL",
    statBig: "$2.02B",
    statLabel: "DPRK CRYPTO TAKE · 2025",
    headline: "The playbook has changed.",
    subhead: "Fewer, larger heists. Endpoint-first, contract-last.",
    accent: "red",
    badge: "HIGH",
    caption: "Bybit · WazirX · DMM · Radiant · Munchables",
  },
  {
    slug: "post-tornado-cash",
    kicker: "▸ ORIGINAL · LAUNDERING ANALYSIS",
    statBig: "45 DAYS",
    statLabel: "DEFAULT DPRK LAUNDERING CYCLE",
    headline: "Where DPRK launders now.",
    subhead: "THORChain → mixer portfolio → Garantex + Huione.",
    accent: "amber",
    badge: "MEDIUM",
    caption: "Sub-$500k tranches · 45-day window",
  },
  {
    slug: "dprk-it-worker-kill-chain",
    kicker: "▸ ORIGINAL · THREAT INTEL",
    statBig: "$417M",
    statLabel: "PLACED-OPERATOR DRAINS · 2024",
    headline: "Hire a developer, wait, drain.",
    subhead: "Munchables · Radiant · DMM Bitcoin — same kill chain.",
    accent: "red",
    badge: "HIGH",
    caption: "Placement → patient build → drain",
  },
  {
    slug: "sign-blind-multisigs",
    kicker: "▸ ORIGINAL · ARCHITECTURE ANALYSIS",
    statBig: "$1.74B",
    statLabel: "UI-LAYER DRAINS · 2024-2025",
    headline: "Sign-blind multisigs.",
    subhead: "Bybit and WazirX share a failure mode. Cryptography wasn't broken — the interface was.",
    accent: "red",
    badge: "CRITICAL",
    caption: "WazirX $235M · Bybit $1.5B",
  },
  {
    slug: "bridges-five-failure-modes",
    kicker: "▸ ORIGINAL · ARCHITECTURE ANALYSIS",
    statBig: "5 MODES",
    statLabel: "ROOT CAUSES · ALL BRIDGE LOSSES",
    headline: "Bridges keep dying.",
    subhead: "Validator capture · sig bypass · proof-construction · key custody · upgrade abuse.",
    accent: "amber",
    badge: "MEDIUM",
    caption: "Ronin · Wormhole · Nomad · Multichain · Poly",
  },
  {
    slug: "garantex",
    kicker: "▸ ORIGINAL · SANCTIONED ENTITIES",
    statBig: "$100B",
    statLabel: "GARANTEX LIFETIME VOLUME",
    headline: "Lazarus's off-ramp.",
    subhead: "82% tied to sanctioned entities. The Tron USDT rail you should be watching.",
    accent: "red",
    badge: "HIGH",
    caption: "OFAC 2022 · redesignated Aug 2025",
  },
  {
    slug: "dprk-45-day-cycle",
    kicker: "▸ ORIGINAL · LAUNDERING ANALYSIS",
    statBig: "60-90D",
    statLabel: "NEW POST-INCIDENT SCRUTINY WINDOW",
    headline: "DPRK's new operational tempo.",
    subhead: "The 45-day cycle changes what 'fresh' versus 'cold' means for monitoring teams.",
    accent: "amber",
    badge: "MEDIUM",
    caption: "Tuned against velocity heuristics",
  },
  // ── Top-traffic incidents (SEO landers — "[protocol] hack timeline") ─
  {
    slug: "incident-bybit",
    kicker: "▸ INCIDENT · EXCHANGE HACK",
    statBig: "$1.5B",
    statLabel: "BYBIT · FEB 2025",
    headline: "The largest single crypto theft on record.",
    subhead: "Lazarus compromised the signing UI, not the cold wallet. The human-machine boundary was.",
    accent: "red",
    badge: "CRITICAL",
    caption: "FBI attribution: 26 Feb 2025",
  },
  {
    slug: "incident-ronin",
    kicker: "▸ INCIDENT · BRIDGE HACK",
    statBig: "$625M",
    statLabel: "RONIN BRIDGE · MAR 2022",
    headline: "5-of-9 validator quorum, captured.",
    subhead: "Social engineering + a stale allow-list. The architectural template for every bridge loss since.",
    accent: "red",
    badge: "CRITICAL",
    caption: "Axie Infinity · Sky Mavis",
  },
  {
    slug: "incident-wormhole",
    kicker: "▸ INCIDENT · BRIDGE HACK",
    statBig: "$325M",
    statLabel: "WORMHOLE · FEB 2022",
    headline: "Signature verification bypass.",
    subhead: "A deprecated Solana sysvar function. The cryptographic primitive everyone trusted.",
    accent: "red",
    badge: "CRITICAL",
    caption: "Jump Crypto bailed it out",
  },
  {
    slug: "incident-nomad",
    kicker: "▸ INCIDENT · BRIDGE HACK",
    statBig: "$190M",
    statLabel: "NOMAD · AUG 2022",
    headline: "The copy-paste mob attack.",
    subhead: "A bad upgrade set the trusted root to zero. Anyone could craft a 'valid' proof. They did.",
    accent: "amber",
    badge: "HIGH",
    caption: "Hundreds of opportunistic addresses",
  },
  {
    slug: "incident-euler",
    kicker: "▸ INCIDENT · DEFI EXPLOIT",
    statBig: "$197M",
    statLabel: "EULER FINANCE · MAR 2023",
    headline: "donateToReserves, and the full recovery.",
    subhead: "The exploiter returned every penny after weeks of public negotiation. The rare happy ending.",
    accent: "green",
    badge: "MEDIUM",
    caption: "Full recovery after 23 days",
  },
  {
    slug: "incident-atomic",
    kicker: "▸ INCIDENT · WALLET HACK",
    statBig: "$100M+",
    statLabel: "ATOMIC WALLET · JUN 2023",
    headline: "Lazarus targets self-custody.",
    subhead: "Non-custodial doesn't mean safe. The wallet software itself was the attack surface.",
    accent: "red",
    badge: "HIGH",
    caption: "Garantex laundering trail documented",
  },
  {
    slug: "incident-curve",
    kicker: "▸ INCIDENT · DEFI EXPLOIT",
    statBig: "$70M",
    statLabel: "CURVE FINANCE · JUL 2023",
    headline: "The Vyper compiler reentrancy bug.",
    subhead: "Not a contract bug — a compiler bug. Every Vyper project shipped on three versions was suddenly vulnerable.",
    accent: "amber",
    badge: "HIGH",
    caption: "Vyper 0.2.15 · 0.2.16 · 0.3.0",
  },
  {
    slug: "incident-multichain",
    kicker: "▸ INCIDENT · BRIDGE COLLAPSE",
    statBig: "$125M",
    statLabel: "MULTICHAIN · JUL 2023",
    headline: "The CEO arrest and the missing MPC keys.",
    subhead: "The bridge died when the people died. Off-chain key custody is a single point of failure.",
    accent: "red",
    badge: "CRITICAL",
    caption: "Zhaojun arrested by Chinese police",
  },
  {
    slug: "incident-mixin",
    kicker: "▸ INCIDENT · EXCHANGE HACK",
    statBig: "$200M",
    statLabel: "MIXIN NETWORK · SEP 2023",
    headline: "Cloud-provider database breach.",
    subhead: "The exchange survives the smart contracts; it dies on the cloud vendor's compromised credentials.",
    accent: "amber",
    badge: "HIGH",
    caption: "Hong Kong-based · partial recovery",
  },
  {
    slug: "incident-poloniex",
    kicker: "▸ INCIDENT · EXCHANGE HACK",
    statBig: "$126M",
    statLabel: "POLONIEX · NOV 2023",
    headline: "Justin Sun's exchange, drained.",
    subhead: "Hot-wallet drain attributed to Lazarus. The 2023 pattern: own a CEX, lose to DPRK.",
    accent: "red",
    badge: "HIGH",
    caption: "Justin Sun-owned",
  },
  {
    slug: "incident-munchables",
    kicker: "▸ INCIDENT · INSIDER",
    statBig: "$62.5M",
    statLabel: "MUNCHABLES · MAR 2024",
    headline: "The DPRK IT-worker insider — full recovery.",
    subhead: "Four engineers, one operator, multiple identities. ZachXBT pulled the thread. Funds returned.",
    accent: "green",
    badge: "HIGH",
    caption: "Blast Network · ZachXBT investigation",
  },
  {
    slug: "incident-dmm",
    kicker: "▸ INCIDENT · SUPPLY CHAIN",
    statBig: "$305M",
    statLabel: "DMM BITCOIN · MAY 2024",
    headline: "TraderTraitor compromised the vendor.",
    subhead: "DMM's wallet-software vendor was the entry point. The supply chain is the new threat model.",
    accent: "red",
    badge: "CRITICAL",
    caption: "Ginco vendor · LinkedIn pretext",
  },
  {
    slug: "incident-wazirx",
    kicker: "▸ INCIDENT · EXCHANGE HACK",
    statBig: "$230M",
    statLabel: "WAZIRX · JUL 2024",
    headline: "Liminal multisig and the upgraded contract.",
    subhead: "Six signers approved. None saw the actual transaction. The sign-blind multisig failure mode.",
    accent: "red",
    badge: "CRITICAL",
    caption: "India's largest exchange",
  },
  {
    slug: "incident-radiant",
    kicker: "▸ INCIDENT · DEFI EXPLOIT",
    statBig: "$50M",
    statLabel: "RADIANT CAPITAL · OCT 2024",
    headline: "INLETDRIFT — the Telegram-phished contractor.",
    subhead: "A trusted ex-contractor's account, weaponized. The kill chain that doesn't need a smart-contract bug.",
    accent: "red",
    badge: "HIGH",
    caption: "Mandiant attribution: UNC4736",
  },
  {
    slug: "incident-poly",
    kicker: "▸ INCIDENT · BRIDGE HACK",
    statBig: "$611M",
    statLabel: "POLY NETWORK · AUG 2021",
    headline: "Mr. White Hat and the full return.",
    subhead: "The largest crypto theft of 2021, fully returned within days. The exploiter said it was 'for fun.'",
    accent: "green",
    badge: "HISTORIC",
    caption: "Cross-chain bridge · all funds returned",
  },
  // ── Long-tail incidents ────────────────────────────────────────────
  {
    slug: "incident-mt-gox",
    kicker: "▸ INCIDENT · EXCHANGE COLLAPSE",
    statBig: "$450M",
    statLabel: "MT. GOX · 2014",
    headline: "The original crypto bankruptcy.",
    subhead: "The slow-bleed, the BTC-e laundering trail, and a decade of clawbacks.",
    accent: "amber",
    badge: "HISTORIC",
    caption: "Tokyo · 850,000 BTC missing",
  },
  {
    slug: "incident-ftx",
    kicker: "▸ INCIDENT · POST-COLLAPSE",
    statBig: "$477M",
    statLabel: "FTX · NOV 2022",
    headline: "Drain during the chaos.",
    subhead: "Funds vanished from FTX hot wallets the same week as the bankruptcy filing. Insider or DPRK — both reads survive.",
    accent: "red",
    badge: "CRITICAL",
    caption: "DOJ investigation ongoing",
  },
  {
    slug: "incident-harmony",
    kicker: "▸ INCIDENT · BRIDGE HACK",
    statBig: "$100M",
    statLabel: "HARMONY HORIZON · JUN 2022",
    headline: "Lazarus, Tornado Cash trail.",
    subhead: "The bridge died on signer compromise. The funds laundered through Tornado Cash at speed.",
    accent: "red",
    badge: "HIGH",
    caption: "Multi-sig private keys phished",
  },
  {
    slug: "incident-bnb",
    kicker: "▸ INCIDENT · BRIDGE HACK",
    statBig: "$570M",
    statLabel: "BNB BRIDGE · OCT 2022",
    headline: "IAVL Merkle proof forgery.",
    subhead: "The cryptographic primitive everyone trusted. Cosmos-style bridges learned the same lesson twice.",
    accent: "red",
    badge: "CRITICAL",
    caption: "Validators halted the chain",
  },
  {
    slug: "incident-beanstalk",
    kicker: "▸ INCIDENT · DEFI EXPLOIT",
    statBig: "$182M",
    statLabel: "BEANSTALK FARMS · APR 2022",
    headline: "Governance, via flash loan.",
    subhead: "The attacker bought the protocol's vote, passed an emergency proposal, drained the vault. The governance attack template.",
    accent: "amber",
    badge: "HIGH",
    caption: "Flash-loan governance capture",
  },
  {
    slug: "incident-badgerdao",
    kicker: "▸ INCIDENT · FRONT-END",
    statBig: "$120M",
    statLabel: "BADGERDAO · DEC 2021",
    headline: "Cloudflare API key, weaponized.",
    subhead: "The contracts were never touched. The attacker injected JavaScript into the front-end and got users to approve.",
    accent: "red",
    badge: "HIGH",
    caption: "Cloudflare account compromise",
  },
  {
    slug: "incident-kucoin",
    kicker: "▸ INCIDENT · EXCHANGE HACK",
    statBig: "$281M",
    statLabel: "KUCOIN · SEP 2020",
    headline: "Lazarus, 84% recovered.",
    subhead: "An aggressive ecosystem-wide response froze the bulk of the stolen funds across project teams.",
    accent: "green",
    badge: "HIGH",
    caption: "Token issuer freezes mattered",
  },
  {
    slug: "incident-bzx",
    kicker: "▸ INCIDENT · DEFI EXPLOIT",
    statBig: "$954K",
    statLabel: "BZX · FEB 2020",
    headline: "The first DeFi flash-loan exploit.",
    subhead: "Two attacks in a week. Tiny dollar value, but the template every future flash-loan hack copied.",
    accent: "amber",
    badge: "HISTORIC",
    caption: "Double exploit · template-setter",
  },
  {
    slug: "incident-lendfme",
    kicker: "▸ INCIDENT · DEFI EXPLOIT",
    statBig: "$25M",
    statLabel: "LENDF.ME · APR 2020",
    headline: "ERC777 reentrancy, full return in 48h.",
    subhead: "imBTC's ERC777 hooks let the attacker reenter. The exploiter returned everything within two days.",
    accent: "green",
    badge: "MEDIUM",
    caption: "Full recovery · 48 hours",
  },
  {
    slug: "incident-eterbase",
    kicker: "▸ INCIDENT · EXCHANGE HACK",
    statBig: "$5.4M",
    statLabel: "ETERBASE · SEP 2020",
    headline: "Early Lazarus exemplar.",
    subhead: "Slovak exchange. The 2020 case that taught the threat-intel community what the placed-operator playbook looked like.",
    accent: "amber",
    badge: "MEDIUM",
    caption: "Slovak Bratislava-based",
  },
  {
    slug: "incident-coinspaid",
    kicker: "▸ INCIDENT · SUPPLY CHAIN",
    statBig: "$37M",
    statLabel: "COINSPAID · JUL 2023",
    headline: "Lazarus's fake-job kill chain.",
    subhead: "Six months of pretexted recruiter contact ending in a malicious 'pre-employment test' that ran on a developer machine.",
    accent: "red",
    badge: "HIGH",
    caption: "Estonian payment processor",
  },
  {
    slug: "incident-alphapo",
    kicker: "▸ INCIDENT · PAYMENT HACK",
    statBig: "$60M",
    statLabel: "ALPHAPO · JUL 2023",
    headline: "Multi-chain payment processor, drained.",
    subhead: "Same operator, same week as CoinsPaid. Lazarus consolidating the SE-Asia payment-rail attack surface.",
    accent: "red",
    badge: "HIGH",
    caption: "Estonia · same week as CoinsPaid",
  },
  {
    slug: "incident-bitfinex",
    kicker: "▸ INCIDENT · EXCHANGE HACK",
    statBig: "119,756",
    statLabel: "BTC STOLEN · BITFINEX 2016",
    headline: "$3.6B seized by DOJ in 2022.",
    subhead: "Six years cold. Then the Lichtensteins were arrested, the chain analysis published, and the laundering trail unwound.",
    accent: "amber",
    badge: "HISTORIC",
    caption: "Lichtenstein + Morgan · 2022 arrest",
  },
  {
    slug: "incident-twitter-2020",
    kicker: "▸ INCIDENT · SOCIAL ENG",
    statBig: "130",
    statLabel: "HIJACKED CELEBRITY ACCOUNTS",
    headline: "The Twitter Bitcoin scam.",
    subhead: "Two teenagers and a phone call. Obama, Musk, Biden, Bezos — all retweeting a Bitcoin doubler. $120k take.",
    accent: "amber",
    badge: "HISTORIC",
    caption: "July 15, 2020 · vishing",
  },
  {
    slug: "incident-wintermute",
    kicker: "▸ INCIDENT · MM HACK",
    statBig: "$160M",
    statLabel: "WINTERMUTE · SEP 2022",
    headline: "Profanity vanity-address vulnerability.",
    subhead: "The 'cool' 7-leading-zeros admin address turned out to be crackable. Every Profanity-generated key is now a known-bad.",
    accent: "amber",
    badge: "HIGH",
    caption: "Profanity vanity-gen tool",
  },
  {
    slug: "incident-orbit",
    kicker: "▸ INCIDENT · BRIDGE HACK",
    statBig: "$81M",
    statLabel: "ORBIT BRIDGE · DEC 31 2023",
    headline: "New Year's Eve Lazarus drain.",
    subhead: "The bridge was compromised the night the team wasn't watching. Classic timing.",
    accent: "red",
    badge: "HIGH",
    caption: "Korea-based · 7 of 10 multisig",
  },
  {
    slug: "incident-kyberswap",
    kicker: "▸ INCIDENT · DEFI EXPLOIT",
    statBig: "$48M",
    statLabel: "KYBERSWAP ELASTIC · NOV 2023",
    headline: "Andean Medjedovic's precision attack.",
    subhead: "Mathematical reentrancy at floating-point precision. The exploiter signed his name in a post-hack tweetstorm.",
    accent: "amber",
    badge: "HIGH",
    caption: "Self-attribution · 'Doctor of Code'",
  },
  {
    slug: "incident-pancake-bunny",
    kicker: "▸ INCIDENT · DEFI EXPLOIT",
    statBig: "$200M",
    statLabel: "PANCAKE BUNNY · MAY 2021",
    headline: "BSC flash-loan oracle pump.",
    subhead: "The PancakeSwap-pair price feed was a single-block oracle. Flash loan, pump, drain — all atomic.",
    accent: "red",
    badge: "HIGH",
    caption: "BSC · spot oracle vulnerability",
  },
  {
    slug: "incident-liquid",
    kicker: "▸ INCIDENT · EXCHANGE HACK",
    statBig: "$97M",
    statLabel: "LIQUID GLOBAL · AUG 2021",
    headline: "Lazarus drain of Japanese exchange.",
    subhead: "Hot-wallet compromise across multiple chains. The 2021 entry in the Japanese-exchange Lazarus dossier.",
    accent: "red",
    badge: "HIGH",
    caption: "Tokyo-based · ETH + BTC drains",
  },
  {
    slug: "incident-platypus",
    kicker: "▸ INCIDENT · DEFI EXPLOIT",
    statBig: "$8.5M",
    statLabel: "PLATYPUS FINANCE · FEB 2023",
    headline: "Avalanche flash-loan emergencyWithdraw.",
    subhead: "The emergency-withdraw path skipped the solvency check. Flash loan, pump-and-bypass, exit.",
    accent: "amber",
    badge: "MEDIUM",
    caption: "Avalanche · post-attack arrests",
  },
  {
    slug: "incident-vulcan-forged",
    kicker: "▸ INCIDENT · KEY EXFIL",
    statBig: "$140M",
    statLabel: "VULCAN FORGED · DEC 2021",
    headline: "Polygon NFT marketplace key exfiltration.",
    subhead: "The custodial gaming wallet provider was the attack surface. Players woke up to drained inventories.",
    accent: "red",
    badge: "HIGH",
    caption: "Polygon · custodial wallets",
  },
  {
    slug: "incident-chaos-ransomware",
    kicker: "▸ INCIDENT · RANSOMWARE",
    statBig: "$2.4M",
    statLabel: "FBI SEIZURE · APR 2025",
    headline: "FBI seizes funds from 'Hors'.",
    subhead: "The Chaos ransomware operator's wallets — public attribution, multi-jurisdiction takedown.",
    accent: "green",
    badge: "SEIZURE",
    caption: "FBI Cyber Division",
  },
  {
    slug: "incident-hydra",
    kicker: "▸ INCIDENT · DARKNET",
    statBig: "$5B",
    statLabel: "HYDRA MARKET · APR 2022",
    headline: "Russian-language drug market, seized.",
    subhead: "DOJ + BKA joint takedown. Six years of operation, hundreds of vendors, $5B in lifetime crypto volume.",
    accent: "green",
    badge: "SEIZURE",
    caption: "BKA / DOJ joint operation",
  },
  {
    slug: "incident-silk-road",
    kicker: "▸ INCIDENT · SEIZURE",
    statBig: "50,676",
    statLabel: "BTC SEIZED · 2021",
    headline: "Popcorn-tin justice.",
    subhead: "James Zhong hid the Silk Road BTC in a popcorn tin under his bathroom floor for ten years. The IRS found it.",
    accent: "green",
    badge: "SEIZURE",
    caption: "James Zhong · IRS-CI",
  },
  {
    slug: "incident-cream",
    kicker: "▸ INCIDENT · DEFI EXPLOIT",
    statBig: "$130M",
    statLabel: "CREAM FINANCE · OCT 2021",
    headline: "Flash loan, 68 assets, two attackers.",
    subhead: "Two distinct attackers split the spoils across 68 different collateral assets. The largest single-protocol DeFi loss of 2021.",
    accent: "amber",
    badge: "HIGH",
    caption: "Compound fork · multi-collateral",
  },
  {
    slug: "incident-sim-hyon-sop",
    kicker: "▸ INCIDENT · OFAC SDN",
    statBig: "OFAC",
    statLabel: "DPRK FTB CRYPTO LAUNDERING",
    headline: "Sim Hyon Sop — Apr 2023 designation.",
    subhead: "Treasury named the Foreign Trade Bank operator who moved Lazarus's stolen crypto into fiat for the regime.",
    accent: "red",
    badge: "SDN",
    caption: "DPRK Foreign Trade Bank",
  },
  {
    slug: "incident-sinbad",
    kicker: "▸ INCIDENT · MIXER SDN",
    statBig: "OFAC",
    statLabel: "SINBAD · NOV 2023",
    headline: "The Lazarus mixer that replaced Blender.",
    subhead: "OFAC designated Sinbad after tracking $100M+ in DPRK flows. Same operator as Blender, different brand.",
    accent: "red",
    badge: "SDN",
    caption: "Successor to Blender",
  },
  {
    slug: "incident-coinex",
    kicker: "▸ INCIDENT · EXCHANGE HACK",
    statBig: "$54M",
    statLabel: "COINEX · SEP 2023",
    headline: "Lazarus, and the Stake.com link.",
    subhead: "The same operator address that drained CoinEx surfaced 11 days later in the Stake.com breach. The 2023 cluster signature.",
    accent: "red",
    badge: "HIGH",
    caption: "Operator-cluster fingerprint",
  },
  {
    slug: "incident-stake",
    kicker: "▸ INCIDENT · EXCHANGE HACK",
    statBig: "$41M",
    statLabel: "STAKE.COM · SEP 2023",
    headline: "FBI attribution in 72 hours.",
    subhead: "The fastest public FBI Lazarus attribution on record. The on-chain address overlap with CoinEx made the case.",
    accent: "red",
    badge: "HIGH",
    caption: "FBI public attribution · 72h",
  },
  {
    slug: "incident-heco",
    kicker: "▸ INCIDENT · BRIDGE HACK",
    statBig: "$99M",
    statLabel: "HECO + HTX · NOV 2023",
    headline: "Justin Sun's bridge private-key leak.",
    subhead: "Cross-chain bridge plus the exchange behind it. The third Justin Sun-adjacent incident in eight weeks.",
    accent: "red",
    badge: "HIGH",
    caption: "Justin Sun ecosystem",
  },
  {
    slug: "incident-penpie",
    kicker: "▸ INCIDENT · DEFI EXPLOIT",
    statBig: "$27M",
    statLabel: "PENPIE · SEP 2024",
    headline: "Pendle reentrancy + TC laundering.",
    subhead: "A market-creation reentrancy in Pendle's protocol. Tornado Cash for the laundering — post-delisting test run.",
    accent: "amber",
    badge: "MEDIUM",
    caption: "Pendle reentrancy",
  },
  {
    slug: "incident-phemex",
    kicker: "▸ INCIDENT · EXCHANGE HACK",
    statBig: "$85M",
    statLabel: "PHEMEX · JAN 2025",
    headline: "Lazarus — the on-chain link to Bybit.",
    subhead: "The Phemex drainer wallets surface again in the Bybit attack a month later. Same operator, two heists.",
    accent: "red",
    badge: "HIGH",
    caption: "January 2025 · Bybit precursor",
  },
  {
    slug: "incident-mango",
    kicker: "▸ INCIDENT · ORACLE MANIP",
    statBig: "$114M",
    statLabel: "MANGO MARKETS · OCT 2022",
    headline: "Avi Eisenberg — conviction & vacatur.",
    subhead: "Oracle manipulation called 'highly profitable trading strategy' by the attacker. Convicted, then vacated on appeal.",
    accent: "amber",
    badge: "VACATED",
    caption: "Solana · Avi Eisenberg",
  },
  {
    slug: "incident-mxc",
    kicker: "▸ INCIDENT · TOKEN SWAP",
    statBig: "FORCED",
    statLabel: "MXC → XMXC SWAP · OCT 2023",
    headline: "DePIN miner cohort, forced.",
    subhead: "The Moonchain transition imposed a token swap on existing MXC holders. Long-tail DePIN risk surfaced.",
    accent: "amber",
    badge: "MEDIUM",
    caption: "MatchX · Moonchain transition",
  },
  // ── 2026-05-18 RexIntel investigative pieces ───────────────────────
  {
    slug: "despark-drainer-expose",
    kicker: "▸ ORIGINAL · DRAINER-AS-A-SERVICE",
    statBig: "47 MIN",
    statLabel: "AFTER THE CALL ENDED",
    headline: "Consensys-funded research call → drain.",
    subhead: "8-tx Solana sweep, 80 seconds. Same operator still hitting victims this week.",
    accent: "red",
    badge: "CRITICAL",
    caption: "Despark.io · Consensys Mesh portfolio · live operator wallets $27K+",
  },
  {
    slug: "oriolo-impersonation",
    kicker: "▸ ORIGINAL · SOCIAL ENGINEERING",
    statBig: "24 HRS",
    statLabel: "FROM PITCH TO DRAIN",
    headline: "Fake VC on Telegram → BTC sweep.",
    subhead: "One 'open in app' message. Multi-victim cohort in same cash-out hub.",
    accent: "amber",
    badge: "CRITICAL",
    caption: "@oriollo_alessio · Lazarus Dream-Job VC-side variant",
  },
  {
    slug: "pink-drainer-niftydegen",
    kicker: "▸ ORIGINAL · NFT PHISHING",
    statBig: "12 SEC",
    statLabel: "BLUR SIGNATURE → DRAIN",
    headline: "A 2.4 ETH PFP, gone in twelve seconds.",
    subhead: "Vanity scam contract drained 99+ wallets across Sept 2023 → Jan 2024.",
    accent: "red",
    badge: "HIGH",
    caption: "NiftyDegen #5504 · Blur.io · Scam Sniffer-flagged Fake_Phishing187019",
  },
];

const ACCENT: Record<NonNullable<Hero["accent"]>, { hex: string; alt: string }> = {
  green: { hex: "#5fb91f", alt: "#1fa8e0" },
  red: { hex: "#f87171", alt: "#fbbf24" },
  amber: { hex: "#fbbf24", alt: "#f87171" },
  blue: { hex: "#60a5fa", alt: "#5fb91f" },
};

function render(hero: Hero): string {
  const acc = ACCENT[hero.accent ?? "green"];
  // Scale the big stat horizontally based on character count so the longer
  // strings ($2.02B, $1.74B) fit without overflowing the column.
  const statLen = hero.statBig.length;
  const statFontPx =
    statLen <= 4 ? 380 : statLen <= 5 ? 320 : statLen <= 6 ? 270 : 230;
  const badge = hero.badge
    ? `
  <g transform="translate(1530 130)">
    <rect width="260" height="48" rx="2" fill="none" stroke="${acc.hex}" stroke-width="1.5"/>
    <text x="130" y="32" font-family="ui-monospace,Menlo,Consolas,monospace" font-size="22" letter-spacing="6" fill="${acc.hex}" text-anchor="middle">${escape(hero.badge)}</text>
  </g>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080" role="img" aria-label="${escape(hero.headline)} — ${escape(hero.statBig)} ${escape(hero.statLabel)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0b0b0d"/>
      <stop offset="1" stop-color="#06060a"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${acc.hex}"/>
      <stop offset="1" stop-color="${acc.alt}"/>
    </linearGradient>
    <pattern id="grid" width="80" height="80" patternUnits="userSpaceOnUse">
      <path d="M80 0 L0 0 0 80" fill="none" stroke="#1a1a1f" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="1920" height="1080" fill="url(#bg)"/>
  <rect width="1920" height="1080" fill="url(#grid)" opacity="0.55"/>

  <g opacity="0.06" fill="${acc.hex}">
    <rect y="180" width="1920" height="1"/>
    <rect y="540" width="1920" height="1"/>
    <rect y="900" width="1920" height="1"/>
  </g>

  <rect x="120" y="120" width="4" height="840" fill="url(#accent)"/>

  <g font-family="ui-monospace,Menlo,Consolas,monospace" font-size="26" letter-spacing="6">
    <text x="160" y="160" fill="${acc.hex}">${escape(hero.kicker)}</text>
  </g>
  ${badge}

  <g font-family="Georgia,'Times New Roman',serif" font-weight="700">
    <text x="160" y="500" font-size="${statFontPx}" fill="#ffffff" letter-spacing="-12">${escape(hero.statBig)}</text>
  </g>

  <g font-family="ui-monospace,Menlo,Consolas,monospace" letter-spacing="4">
    <text x="160" y="570" font-size="32" fill="#9ca3af">${escape(hero.statLabel)}</text>
  </g>

  <line x1="160" y1="640" x2="900" y2="640" stroke="${acc.hex}" stroke-width="2" opacity="0.4"/>

  <g font-family="Georgia,'Times New Roman',serif" font-weight="600" fill="#ffffff">
    <text x="160" y="760" font-size="68">${escape(hero.headline)}</text>
  </g>
  <g font-family="Georgia,'Times New Roman',serif" font-weight="400" fill="#9ca3af">
    ${renderSubhead(hero.subhead, 160, 830, 44, 56)}
  </g>

  <g font-family="ui-monospace,Menlo,Consolas,monospace" font-size="22" letter-spacing="4">
    <text x="160" y="985" fill="${acc.hex}">REX INTEL SERVICES</text>
    <text x="160" y="1020" fill="#6b7280">${escape(hero.caption ?? "INVESTIGATIONS DESK")}</text>
  </g>

  <g font-family="ui-monospace,Menlo,Consolas,monospace" font-size="20" letter-spacing="3" fill="#3a3a42">
    <text x="1760" y="1020" text-anchor="end">rex-intel-services</text>
  </g>
</svg>
`;
}

// Wraps the subhead to two lines max so a long sentence doesn't bleed into
// the watermark band. SVG has no native line-wrap, so we hand-split on the
// nearest word boundary inside the column.
function renderSubhead(text: string, x: number, y: number, fontSize: number, lineHeight: number): string {
  const max = 60; // chars per line at our font size + column width
  if (text.length <= max) {
    return `<text x="${x}" y="${y}" font-size="${fontSize}">${escape(text)}</text>`;
  }
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  const a = (space > 30 ? cut.slice(0, space) : cut).trim();
  const b = text.slice(a.length).trim();
  return [
    `<text x="${x}" y="${y}" font-size="${fontSize}">${escape(a)}</text>`,
    `<text x="${x}" y="${y + lineHeight}" font-size="${fontSize}">${escape(b)}</text>`,
  ].join("\n    ");
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function main() {
  const outDir = join(process.cwd(), "public", "intel-heroes");
  mkdirSync(outDir, { recursive: true });
  for (const h of HEROES) {
    const path = join(outDir, `${h.slug}.svg`);
    writeFileSync(path, render(h), "utf8");
    console.log(`wrote /intel-heroes/${h.slug}.svg`);
  }
  console.log(`\n✓ ${HEROES.length} heroes generated`);
}

main();
