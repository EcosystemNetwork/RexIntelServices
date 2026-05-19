/**
 * Run with: npx tsx scripts/seed-hackathons.ts
 *
 * Seeds hackathons that don't come from the ETHGlobal feed
 * (scripts/seed-events-ethglobal.ts already seeds the ETHGlobal series).
 * Includes crypto/web3 hackathons plus AI / agentic-engineering hackathons
 * (e.g. tokens&), since both audiences overlap with RexIntel builders.
 * Pulled from DoraHacks, Devpost, lablab.ai, Encode Club, Akindo, Colosseum,
 * Luma, and the official organizer announcements — every entry below has a
 * confirmed source URL. Idempotent: matched by payload->>'name'.
 *
 * Curation bar: each entry must have ≥$1,000 cash prize OR a non-cash hook
 * worth a builder's weekend (demo day to real fund, hardware, marquee judges,
 * invite-only access, guaranteed grant). Entries that fell short are listed
 * in `removedNames` below and purged from the DB on every run so cuts stick.
 *
 * Date handling: 12:00 UTC start / 23:00 UTC end so the displayed calendar
 * date stays stable across timezones.
 */
import "dotenv/config";
import { and, eq, sql } from "drizzle-orm";
import { db, submissions } from "../src/lib/db";
import type { EventPayload } from "../src/lib/db/schema";

type SeedInput = {
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  city?: string;
  country?: string;
  url: string;
  description: string;
  prizeUsd?: number;
  // Optional explicit registration deadline (YYYY-MM-DD). When omitted, the
  // toPayload helper applies a default: online/hybrid hackathons can take late
  // registration through the submission window (defaults to endDate), while
  // in-person hackathons cut off at kickoff (defaults to startDate).
  registrationDeadline?: string;
};

const inputs: SeedInput[] = [
  // === Solana ecosystem (Colosseum-run global hackathons) ===
  {
    name: "Solana Frontier Hackathon 2026",
    startDate: "2026-04-06",
    endDate: "2026-05-11",
    city: "Online",
    url: "https://colosseum.com/",
    description:
      "Solana's spring 2026 global online hackathon, run on Colosseum. Build on Solana for a share of the prize pool and follow-on investment.",
  },
  {
    name: "Solana Fall Hackathon 2026",
    startDate: "2026-09-28",
    endDate: "2026-11-02",
    city: "Online",
    url: "https://colosseum.com/",
    description:
      "Solana's autumn 2026 global online hackathon, run on Colosseum. Five-week build window for new founders launching on Solana — top teams pitch Colosseum's accelerator (backed by Multicoin, Anagram, and Solana Ventures) for follow-on investment.",
  },

  // === Encode Club programmes ===
  {
    name: "Hyperliquid London Community Hackathon",
    startDate: "2026-01-16",
    endDate: "2026-01-18",
    city: "London",
    country: "United Kingdom",
    url: "https://www.encodeclub.com/programmes/hyperliquid-london-hackathon",
    description:
      "3-day in-person hackathon at Encode Hub focused on on-chain trading and Hyperliquid tooling. Workshops with Hyperliquid teams, bounties, and late-night hacking.",
  },
  {
    name: "Encode AI London Hackathon 2026",
    startDate: "2026-03-20",
    endDate: "2026-03-22",
    city: "London",
    country: "United Kingdom",
    url: "https://www.encodeclub.com/programmes/ai-london-2026",
    description:
      "3-day in-person AI hackathon at Encode Hub in Shoreditch. Builders, founders, researchers and students hacking on the frontier of AI.",
  },
  {
    name: "Kite AI Global Hackathon 2026",
    startDate: "2026-03-27",
    endDate: "2026-04-26",
    city: "Online",
    url: "https://www.encodeclub.com/programmes/kites-hackathon-ai-agentic-economy",
    description:
      "4-week global online hackathon run by Encode Club with Kite AI and Coinbase Ventures. Three tracks: Agentic Commerce, Agentic Trading, and a Novel track for autonomous AI agents.",
  },

  // === DoraHacks ===
  {
    name: "HashKey Chain Horizon Hackathon",
    startDate: "2026-03-10",
    endDate: "2026-04-23",
    city: "Online",
    url: "https://dorahacks.io/hackathon/2045/report",
    description:
      "HashKey Chain global online hackathon with a 40,000 USDT prize pool. Tracks across DeFi, PayFi, AI and more.",
    prizeUsd: 40000,
  },
  // === Aleph (Crecimiento — LATAM pop-up city hackathon) ===
  {
    name: "Aleph Hackathon 2026",
    startDate: "2026-03-20",
    endDate: "2026-03-22",
    city: "Buenos Aires",
    country: "Argentina",
    url: "https://aleph.crecimiento.build/es-aleph-hackathon",
    description:
      "LATAM crypto + AI hackathon hosted inside the Aleph March '26 pop-up city. In-person hubs across Buenos Aires, Salta and other Latin American cities + online.",
  },

  // === ETHGlobal Cannes (companion to the EthCC Cannes conference) ===
  {
    name: "ETHGlobal Cannes 2026",
    startDate: "2026-04-03",
    endDate: "2026-04-05",
    city: "Cannes",
    country: "France",
    url: "https://ethglobal.com/events/cannes2026",
    description:
      "ETHGlobal in-person Ethereum hackathon at the Palais des Festivals in Cannes, co-located with EthCC week.",
    prizeUsd: 375000,
    // Application closed 2 weeks before kickoff per ethglobal.com schedule.
    registrationDeadline: "2026-03-20",
  },

  // === lablab.ai ===
  {
    name: "Arc & Circle Web3 Hackathon",
    startDate: "2026-04-20",
    endDate: "2026-04-26",
    city: "San Francisco",
    country: "United States",
    url: "https://lablab.ai/event",
    description:
      "Hybrid hackathon run on lablab.ai for agentic economic apps using Circle's Nanopayments infrastructure with USDC settlement on Arc. Online build phase plus on-site demos in SF.",
  },
  // === EasyA (Consensus side hackathons) ===
  {
    name: "EasyA Consensus Miami Hackathon 2026",
    startDate: "2026-05-05",
    endDate: "2026-05-07",
    city: "Miami",
    country: "United States",
    url: "https://www.easya.io/events/easya-consensus-miami-hackathon",
    description:
      "72-hour hackathon co-located with Consensus Miami, $58,000 USD in prizes. ~1,000 developers building AI-native crypto startups across Base, Solana and more.",
    prizeUsd: 58000,
  },

  // === Blockworks / Permissionless ===
  {
    name: "Permissionless IV Hackathon",
    startDate: "2026-06-22",
    endDate: "2026-06-23",
    city: "Brooklyn",
    country: "United States",
    url: "https://blockworks.com/event/permissionless-iv-hackathon",
    description:
      "36-hour onsite hackathon by Cracked Labs and Blockworks at Industry City, Brooklyn — kicks off Permissionless IV. $100,000+ in bounties; free to attend with conference access.",
    prizeUsd: 100000,
  },

  // === ETHGlobal virtual hackathons (DeFi) ===
  {
    name: "ETHGlobal HackMoney 2026",
    startDate: "2026-01-30",
    endDate: "2026-02-11",
    city: "Online",
    url: "https://ethglobal.com/events/hackmoney2026",
    description:
      "ETHGlobal's largest DeFi hackathon of 2026 — virtual, 12 days. Builders shipped stablecoin flows, on/off-ramps and agentic payments.",
    prizeUsd: 300000,
  },

  // === Starknet / ZK ===
  {
    name: "Re{define} Starknet Hackathon 2026",
    startDate: "2026-02-01",
    endDate: "2026-02-28",
    city: "Online",
    url: "https://hackathon.starknet.org/",
    description:
      "Starknet Foundation's flagship 2026 hackathon, run on DoraHacks. $27,000 in prizes across Bitcoin, Privacy and Open tracks; submissions deployed to Starknet.",
    prizeUsd: 27000,
  },

  // === Regional EthCC-week hackathons ===
  {
    name: "Rayls EthCC Hackathon",
    startDate: "2026-03-28",
    endDate: "2026-03-29",
    city: "Cannes",
    country: "France",
    url: "https://ethcc.io/",
    description:
      "Rayls' 2nd developer hackathon, held during EthCC[9] week in Cannes. Part of Rayls' $1M Developer Program in the run-up to its public chain mainnet.",
  },

  // === Bags (creator-finance on Solana) ===
  {
    name: "The Bags Hackathon",
    startDate: "2026-04-14",
    endDate: "2026-06-01",
    city: "Online",
    url: "https://bags.fm/hackathon",
    description:
      "Solana creator-finance hackathon hosted by Bags (also listed on DoraHacks). $1M in direct prizes — top 100 projects each receive a $10k–$100k grant — plus $3M in ongoing funding and support and hardware prizes for winners. Every submission must launch on Bags and link a token to the project. Submissions that integrate via API, SDK, token-launching, trading, or creator tools rank higher. Open-source strongly encouraged; private repos must give judges access.",
    prizeUsd: 1000000,
  },

  // === tokens& (AI / agentic engineering hackathons) ===
  {
    name: "Agentic Engineering Hack NYC 2026",
    startDate: "2026-05-23",
    endDate: "2026-05-23",
    city: "New York",
    country: "United States",
    url: "https://luma.com/nycagenthack",
    description:
      "One-day NYC builder hackathon by tokens&. 9:30 AM – 7:30 PM EDT, with kickoff, day-long hack, demos and awards. Partners: Google DeepMind, Datadog, Nimble, ClickHouse. Speakers/judges from DeepMind, Luminai, Nimble, Airbyte, Crosby and Freeport. Approval required to attend.",
  },
  {
    name: "Harness Engineering Hack SF 2026",
    startDate: "2026-06-12",
    endDate: "2026-06-12",
    city: "San Francisco",
    country: "United States",
    url: "https://luma.com/harnesshack",
    description:
      "One-day SF builder hackathon by tokens&. 9:30 AM – 7:30 PM PDT, with kickoff, day-long hack, demos and awards. Partners: AWS, ElevenLabs, Luminai. Judges from Luminai, Anthropic and Gap Inc. Approval required to attend.",
  },

  // === ElevenHacks (ElevenLabs 11-week weekly hackathon series) ===
  {
    name: "Hack #9: Stripe x ElevenLabs",
    startDate: "2026-05-14",
    endDate: "2026-05-21",
    city: "Online",
    url: "https://hacks.elevenlabs.io/hackathons/8",
    description:
      "Week 9 of ElevenHacks — ElevenLabs' 11-week online series (Mar 19 – May 28, 2026, $240K+ total prizes). This week's Stripe challenge: build something people will pay for using Stripe + ElevenLabs voice APIs. $18,980 prize pool split across Stripe credits and ElevenLabs Scale plans (1st $10,990, 2nd $5,660, 3rd $2,330). Opens Thu 14 May 17:00 UK; submissions close Thu 21 May 17:00 UK; winners Tue 26 May. Judges: Rajan Patel (Stripe), Joe Reeve (ElevenLabs).",
    prizeUsd: 18980,
  },
  {
    name: "Hack #11: D-ID x ElevenLabs",
    startDate: "2026-05-28",
    endDate: "2026-06-04",
    city: "Online",
    url: "https://hacks.elevenlabs.io/hackathons/10",
    description:
      "Final week of ElevenHacks — ElevenLabs' 11-week online series. D-ID's digital-human / avatar APIs paired with ElevenLabs voice APIs. $11,980 prize pool. Opens Thu 28 May 17:00 UK.",
    prizeUsd: 11980,
  },

  // === Canteen / Circle / Arc (Agora) ===
  {
    name: "Agora Agents Hackathon",
    startDate: "2026-05-11",
    endDate: "2026-05-25",
    city: "Online",
    url: "https://agora.thecanteenapp.com/",
    description:
      "Two-week online hackathon run by Canteen with Circle and Arc, focused on AI agents that trade, invest, create, and interface with markets — settling on Arc (Circle's L1) using USDC. $50K total prizes: $40K grand prizes (1st $10K; 2×$7.5K second; 3×$5K third), ~10–12 standout-team awards ($7.5K), feedback incentives ($500) and easter-egg bounties ($2K). Six Requests for Builders: perps trading, prediction-market trading, prediction-market verticals, portfolio management, cross-platform arbitrage, social trading intelligence. Submissions require a live working product demo and public GitHub repo.",
    prizeUsd: 50000,
  },

  // === Sui Foundation ===
  {
    name: "Sui Overflow 2026",
    startDate: "2026-05-01",
    endDate: "2026-06-30",
    city: "Online",
    url: "https://overflow.sui.io/",
    description:
      "Sui Foundation's global online hackathon. $1M+ total prize pool — $500K+ in core track prizes plus specialized track pools. Tracks: Agentic Web, DeFi & Payments, Walrus, DeepBook, Infra & DevX, EVE, ONE Championship, Degen, Payments & Wallets, Entertainment & Culture, and Explorations (multi-chain/RWA). Project submissions due May 23. Demo days June 13–14. Winners announced end of June. $2,500 university awards available. OceanDAO Summit follows in Athens July 21–31.",
    prizeUsd: 1000000,
    // Project submission cutoff per overflow.sui.io schedule.
    registrationDeadline: "2026-05-23",
  },

  // === Arbitrum Open House ===
  {
    name: "Arbitrum Open House London 2026",
    startDate: "2026-05-25",
    endDate: "2026-06-14",
    city: "London",
    country: "United Kingdom",
    url: "https://openhouse.arbitrum.io/",
    description:
      "3-week online Buildathon (May 25 – Jun 14) on Arbitrum followed by a 3-day in-person Founder House in London (Jul 10–12). $115K in Buildathon prizes plus $300K at the Founder House — $415K total. AI Agentic Category reserved $15K for the top three. Top 3 Buildathon winners share $70K; the Arbitrum Foundation also reserves $30K USDC in case-by-case grants. Same format that ran in NYC earlier in the year.",
    prizeUsd: 415000,
  },

  // === EigenLayer / Restaking (Hacker Dojo) ===
  {
    name: "HackAVS 2026 — EigenLayer AVS Global Hackathon",
    startDate: "2026-04-23",
    endDate: "2026-06-06",
    city: "Online",
    url: "https://dorahacks.io/hackathon/hack-avs/tracks",
    description:
      "Global online hackathon by Hacker Dojo for builders shipping AVSes on EigenLayer. $49,500+ in sponsor bounties from Drosera, Movement Labs, OpenLayer, Brevis, WitnessChain, Polymer and Inco Network. Tracks across AVS tooling, decentralized oracles, ZK, watchtowers and shared-security primitives. Submissions open through Jun 6.",
    prizeUsd: 49500,
  },

  // === Polygon Labs ===
  {
    name: "Polygon BUIDL IT 2026",
    startDate: "2026-06-15",
    endDate: "2026-08-01",
    city: "Online",
    url: "https://buidlit.devfolio.co/",
    description:
      "Polygon's flagship global online hackathon. $500,000 prize pool across DeFi, gaming, infra and consumer crypto tracks. Partners: Alchemy, AWS, Chainlink, Filecoin, Sequence, QuickSwap, Spheron. Open to solo builders and teams up to 4 — submit by Aug 1, winners announced Aug 25.",
    prizeUsd: 500000,
    registrationDeadline: "2026-08-01",
  },

  // === Hyperliquid community (Hype Global) ===
  {
    name: "HYPE Singapore 2026 — Hyperliquid Hackathon @ TOKEN2049",
    startDate: "2026-10-05",
    endDate: "2026-10-07",
    city: "Singapore",
    url: "https://hype.global/events/singapore-2026",
    description:
      "Hyperliquid community in-person hackathon during TOKEN2049 Singapore week. Multi-day format expecting 200–300+ builders, with hands-on hacking sessions, access to top mentors and protocol teams, tracks spanning DeFi, infrastructure, HyperEVM apps and trading tools. Prize pool TBA — verify final dates at hype.global/events/singapore-2026 closer to date.",
  },

  // === TOKEN2049 (Singapore) ===
  {
    name: "TOKEN2049 Origins Hackathon Singapore 2026",
    startDate: "2026-10-07",
    endDate: "2026-10-08",
    city: "Singapore",
    url: "https://www.token2049.com/singapore/2049-origins",
    description:
      "Crypto's premier hackathon co-located with TOKEN2049 Singapore (Oct 7–8). 36-hour in-person format for 160+ developers building Web3 products. $50,000 prize pool, top judges from the broader TOKEN2049 stage. Application required.",
    prizeUsd: 50000,
  },

  // === ZK Hack ===
  {
    name: "ZK Hack V 2026",
    startDate: "2026-11-26",
    endDate: "2026-12-17",
    city: "Online",
    url: "https://zkhack.dev/zkhackV/",
    description:
      "Flagship 4-week virtual ZK hackathon. Weekly workshops with leading ZK protocols, advanced puzzle-solving competition (find bugs and win prizes), and an online ZK Job Fair on Gather Town to meet sponsors and explore open roles. Multi-track prize pool funded by the ZK ecosystem.",
  },

  // === Added 2026-05-19 ===
  {
    name: "Solana Summer Camp Hackathon 2026",
    startDate: "2026-07-11",
    endDate: "2026-08-16",
    city: "Online",
    url: "https://dorahacks.io/hackathon/31/detail",
    description:
      "Solana Foundation's flagship summer global hackathon on DoraHacks. Up to $5M in prizes and seed funding across multiple tracks — Consumer, DeFi, Infra, Mobile (Solana Mobile), AI/Agents, DePIN. Top teams pipeline into Colosseum-led accelerator follow-on with Multicoin, Anagram, and Solana Ventures.",
    prizeUsd: 5000000,
  },
  {
    name: "Build-A-Berathon NYC 2026",
    startDate: "2026-08-18",
    endDate: "2026-08-22",
    city: "New York",
    country: "United States",
    url: "https://lu.ma/cwfcnj05",
    description:
      "Berachain's flagship in-person hackathon in NYC. Five days of building on Berachain's Proof-of-Liquidity stack — BGT/HONEY/iBGT-aware DeFi, consumer dApps, gaming. $500K+ in prizes; selected teams demo live to judges, Berachain Foundation, and ecosystem investors.",
    prizeUsd: 500000,
  },

  // === Added 2026-05-19 — YC + HUD AI/agent hackathon ===
  {
    name: "HUD Frontier — RSI RL Environments Hackathon @ YC",
    startDate: "2026-06-26",
    endDate: "2026-06-26",
    city: "San Francisco",
    country: "United States",
    url: "https://events.ycombinator.com/hud-frontier-june-26",
    description:
      "Y Combinator + HUD (YC W25, hud.ai) host an RL environments hackathon at YC's San Francisco HQ. HUD's platform lets builders ship reinforcement-learning environments and evals that frontier AI labs (Anthropic, OpenAI, DeepMind) train Computer Use Agents against — a wedge into the agent-training data layer. Non-cash hook is the room: YC partners + HUD team + frontier-lab evaluators. Confirm exact agenda and any prize pool on the event page.",
  },

  // === Added 2026-05-19 — multi-week AI + crypto cohort ===
  {
    name: "Mantle Turing Test Hackathon 2026 — Phase 2: AI Awakening",
    startDate: "2026-05-01",
    endDate: "2026-06-15",
    city: "Online",
    url: "https://dorahacks.io/hackathon/mantleturingtesthackathon2026",
    description:
      "Mantle's flagship AI-agent campaign — Phase 2 of a $120K total. Six tracks introduce a Human-vs-AI mechanism on autonomous on-chain agents (trading, lending, perps). Prize structure: Grand Champion $9K, six Track First Prizes ($8.5K each = $51K), Community Voting (2×$8.5K = $17K), Best UI/UX $3K, Finalist & Deployment (20×$1K = $20K). Co-hosts: Bybit, Byreal, Blockchain for Good Alliance, Tencent Cloud, DoraHacks, HackQuest. First on-chain environment to benchmark agent performance at scale — every key decision permanently recorded on Mantle.",
    prizeUsd: 100000,
  },
  {
    name: "FIND EVIL! — Autonomous AI Incident Response",
    startDate: "2026-04-15",
    endDate: "2026-06-15",
    city: "Online",
    url: "https://findevil.devpost.com/",
    description:
      "SANS Institute's first hackathon for autonomous AI incident response. Take Protocol SIFT — the framework connecting AI agents to the SIFT Workstation's 200+ forensic tools via MCP — and make it production-ready. Build an AI agent that thinks like a senior analyst: sequences its approach, recognizes when something doesn't add up, self-corrects. Prizes $10K / $7.5K / $3K (top three) + sponsor extras totalling $22K+. Teams up to 5; solo permitted; no IR background required. Submission Jun 15, winners ~Jul 8. Direct fit for blue-team / threat-intel founders.",
    prizeUsd: 22000,
  },
  {
    name: "NandaHack — Agentic AI Hackathon (Phase 2)",
    startDate: "2026-05-07",
    endDate: "2026-06-13",
    city: "Cambridge",
    country: "United States",
    url: "https://nandahack.media.mit.edu/",
    description:
      "MIT Media Lab + HCLTech academic hackathon — Phase 2 of NandaHack (Phase 1 ran Apr 10 – May 7). Six arenas: deploy, coordinate, trade, adapt, defend, integrate — i.e. the real production failure modes of enterprise agent infrastructure (coordination protocols, red-team defense, observability, replay tooling, migration/continuity). Judges are MIT faculty + HCLTech engineering leads; bar is research-grade work with a working prototype. No public cash prize — the hook is MIT Media Lab demo day and academic visibility.",
  },
  {
    name: "Anthropic AI Hackathon — Claude-Native B2B",
    startDate: "2026-05-26",
    endDate: "2026-06-02",
    city: "Online",
    url: "https://lablab.ai/event/anthropic-ai-hackathon",
    description:
      "Lablab.ai-hosted Anthropic hackathon, capped at 3,000 participants. Anthropic explicitly called the six verticals that matter: customer service, legal, coaching, search, back-office, sales — i.e. mainstream B2B where Claude's long-context + safety-aligned reasoning beats alternatives. Top prize is accelerated Claude API access + Anthropic team visibility. Bar is domain-specific structured workflow products, not chat-toy demos.",
  },
  {
    name: "Google Cloud Rapid Agent Hackathon",
    startDate: "2026-05-01",
    endDate: "2026-06-11",
    city: "Online",
    url: "https://rapid-agent.devpost.com/",
    description:
      "Google Cloud + Gemini + MCP hackathon hosted on Devpost. The strategic surface is MCP integrations on top of Google Workspace (Gmail, Calendar, Drive, Docs) and multi-step Gemini reasoning. Prize: Google Cloud credits and swag (specific cash undisclosed). Best return: an agent that puts Gemini behind a daily workflow with MCP as the connective tissue — the proof point Google needs for the Gemini+MCP era.",
  },
  {
    name: "AWS Prompt the Planet Challenge",
    startDate: "2026-03-10",
    endDate: "2026-06-11",
    city: "Online",
    url: "https://promptplanet.devpost.com/",
    description:
      "AWS hackathon with an unusual format — submit prompts, not apps. 10 winners share $50K in AWS credits. Multiple submissions explicitly allowed. AWS engineers + DevRel staff judge based on real customer-support pain (IAM, billing, IaC translation, blast-radius analysis, DR rehearsal). Tactical move: ship five focused prompts in five different pain categories.",
    prizeUsd: 50000,
  },
  {
    name: "DevNetwork AI + ML Hackathon 2026",
    startDate: "2026-05-11",
    endDate: "2026-05-28",
    city: "South San Francisco",
    country: "United States",
    url: "https://devnetwork-ai-ml-hack-2026.devpost.com/",
    description:
      "DevNetwork's flagship AI/ML hackathon — online build (May 11–28) plus in-person finale at AI DevSummit, South SF (May 27–28). Sponsors: Apple, Google, plus rotating challenge tracks (DevOps, Enterprise, ML/AI). Each sponsor track judged by their own engineering team; grand prize ~$12.5K plus a 60K-subscriber newsletter announcement. Real value is the sponsor-track judging (Apple privacy-on-device, Google Gemini/MCP/Workspace).",
    prizeUsd: 12500,
  },
  {
    name: "FlagOS Open Computing Global Challenge — Season 1",
    startDate: "2026-03-01",
    endDate: "2026-06-15",
    city: "Online",
    url: "https://dorahacks.io/hackathon/flagos",
    description:
      "FlagOS Community + Beijing Academy of AI (BAAI) + CCF ODTC systems-level hackathon. 2,000,000 RMB (~$280K USD) across three tracks — Track 1 is per-task operator bounties (FlagGems library); Tracks 2 & 3 fund cross-chip portability and efficiency work proving the same model runs across diverse hardware (not just NVIDIA). Judges are systems engineers and chip-software specialists; bar is technical contributions with measurable benchmarks, not polished apps. Results announced early June.",
    prizeUsd: 280000,
  },
  {
    name: "Reddit Mod Tools Migration Hackathon",
    startDate: "2026-04-15",
    endDate: "2026-05-27",
    city: "Online",
    url: "https://mod-tools-migration.devpost.com/",
    description:
      "Reddit's hackathon to port community moderation tools onto the new Mod Tools Migration platform. $45K total prize pool. Niche but high-fit for community-ops, anti-spam, AI moderation, and trust & safety builders — an area RexIntel is adjacent to via attribution + bad-actor surfaces.",
    prizeUsd: 45000,
  },
  {
    name: "Build with MeDo Hackathon",
    startDate: "2026-04-22",
    endDate: "2026-05-20",
    city: "Online",
    url: "https://medo.devpost.com/",
    description:
      "MeDo (build-with-AI agent stack) hackathon on Devpost. $50K prize pool. Build agents and AI-powered apps on the MeDo platform — broad track structure, generalist AI. Tight window: closes 2026-05-20.",
    prizeUsd: 50000,
  },
];

function toPayload(input: SeedInput): EventPayload {
  const startsAt = `${input.startDate}T12:00:00Z`;
  const endsAt =
    input.endDate === input.startDate
      ? undefined
      : `${input.endDate}T23:00:00Z`;
  // Online/hybrid hackathons typically accept registration through the
  // submission window — default the deadline to the last day. In-person
  // hackathons cut off at kickoff. Explicit `registrationDeadline` always wins.
  const cityLower = (input.city ?? "").toLowerCase();
  const isOnline = ["online", "virtual", "remote", "global", "hybrid"].includes(
    cityLower,
  );
  const defaultDeadlineDate = isOnline
    ? endsAt
      ? input.endDate
      : input.startDate
    : input.startDate;
  const registrationDeadline = input.registrationDeadline
    ? `${input.registrationDeadline}T23:59:00Z`
    : `${defaultDeadlineDate}T23:59:00Z`;
  return {
    name: input.name,
    startsAt,
    endsAt,
    city: input.city,
    country: input.country,
    url: input.url,
    description: input.description,
    eventType: "hackathon",
    prizeUsd: input.prizeUsd,
    registrationDeadline,
  };
}

// Names cut from the seed because they fell short of the curation bar
// (sub-$1K cash with no compelling non-cash hook). Purged from the DB on
// every run so re-running the seed actually removes them from the live index
// rather than orphaning past inserts.
const removedNames: string[] = [
  "Polkadot Solidity Hackathon 2026",
  "StableHacks 2026",
  "AI & Big Data Expo Hackathon",
  "ETHMumbai 2026",
  "ETHPrague 2026",
  "ETHRome 2026",
  "Hackanation 2026",
  "HackPrix Season 3",
  "Hackmos 2026",
  "Hack #10: Blackbox x ElevenLabs",
];

async function purgeRemoved(): Promise<number> {
  if (removedNames.length === 0) return 0;
  const deleted = await db
    .delete(submissions)
    .where(
      and(
        eq(submissions.type, "event"),
        sql`${submissions.payload}->>'name' IN (${sql.join(
          removedNames.map((n) => sql`${n}`),
          sql`, `,
        )})`,
      ),
    )
    .returning({ publicId: submissions.publicId });
  return deleted.length;
}

async function upsertHackathon(input: SeedInput) {
  const payload = toPayload(input);
  const eventStartsAt = new Date(payload.startsAt);

  const existing = await db
    .select({ id: submissions.id, publicId: submissions.publicId })
    .from(submissions)
    .where(
      and(
        eq(submissions.type, "event"),
        sql`${submissions.payload}->>'name' = ${payload.name}`,
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    const [row] = await db
      .update(submissions)
      .set({
        payload,
        eventStartsAt,
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
      type: "event",
      status: "approved",
      payload,
      eventStartsAt,
      publishedAt: new Date(),
    })
    .returning({ publicId: submissions.publicId });
  return { action: "inserted" as const, publicId: row.publicId };
}

async function main() {
  const purged = await purgeRemoved();
  if (purged > 0) {
    console.log(`  purged   ${purged} retired ${purged === 1 ? "entry" : "entries"}\n`);
  }

  let inserted = 0;
  let updated = 0;
  for (const input of inputs) {
    const r = await upsertHackathon(input);
    if (r.action === "inserted") inserted++;
    else updated++;
    console.log(`  ${r.action.padEnd(8)} /events/${r.publicId}  ${input.name}`);
  }
  console.log(
    `\n✓ ${inputs.length} hackathons processed (${inserted} new, ${updated} updated, ${purged} purged).`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
