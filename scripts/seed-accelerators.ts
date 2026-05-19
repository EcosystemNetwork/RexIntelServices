/**
 * Run with: npx tsx scripts/seed-accelerators.ts
 *
 * Seeds active accelerator / incubator programs into /accelerators. Mix of
 * crypto-native programs (Alliance, Orange DAO, Outlier Base Camp, a16z CSX,
 * Berkeley Xcelerator, Binance Labs) and broader founder programs that
 * RexIntel's audience cares about (DevLabs, Okara). Sourced from program
 * homepages where possible.
 *
 * Idempotent: name-match upsert.
 */
import "dotenv/config";
import { and, eq, sql } from "drizzle-orm";
import { db, submissions } from "../src/lib/db";
import type { AcceleratorPayload } from "../src/lib/db/schema";

const accelerators: AcceleratorPayload[] = [
  {
    name: "Alliance DAO",
    organization: "Alliance",
    organizationUrl: "https://www.alliance.xyz/",
    description:
      "Leading crypto + AI accelerator helping early-stage startups reach product-market fit. Backs crypto-native projects, fintech, AI, and Web2.5 teams. Median alum raises $3.5M at $25M post.",
    duration: "10 weeks (2-week NYC onboarding + 8 weeks remote)",
    investment:
      "$500k at $5M post-money via SAFE with 1:1 token side letter; additional $500k post-program at seed close.",
    investmentUsd: 500000,
    location: "NYC (in-person) + Remote",
    focus: "Crypto + AI startups, all stages",
    applyUrl: "https://www.alliance.xyz/apply",
    rolling: true,
    tags: ["crypto", "ai", "seed"],
  },
  {
    name: "Orange DAO Fellowship",
    organization: "Orange DAO",
    organizationUrl: "https://orangedao.xyz/",
    description:
      "12-week crypto company-building program from a 1,300+ founder network. Mentorship from operators at Quantstamp, Cega, Privy, and others. Virtual demo day with 300+ investors.",
    duration: "12 weeks (first 2 weeks + final 2 weeks in SF; remainder via Zoom)",
    investment: "$100k uncapped SAFE with 2% advisory fee",
    investmentUsd: 100000,
    location: "San Francisco (hybrid)",
    focus: "Crypto / Web3 founders, ideation to product",
    applyUrl: "https://tally.so/r/3E2deL",
    rolling: true,
    tags: ["crypto", "web3", "founders"],
  },
  {
    name: "Outlier Ventures Base Camp",
    organization: "Outlier Ventures",
    organizationUrl: "https://outlierventures.io/base-camp/",
    description:
      "Fully remote 12-week accelerator. Multiple vertical tracks — Crypto x Agentic AI, DePIN, DeFi, RWA. 400+ mentors, 180+ alumni startups, in-house token engineers + venture experts.",
    duration: "12 weeks",
    investment: "Equity + future-token-supply arrangement (per program)",
    location: "Remote",
    focus: "Crypto x AI, DePIN, DeFi, RWA",
    applyUrl: "https://outlierventures.io/apply/form/",
    rolling: true,
    tags: ["depin", "defi", "rwa", "ai", "crypto"],
  },
  {
    name: "a16z Crypto Startup Accelerator (CSX)",
    organization: "a16z crypto",
    organizationUrl: "https://a16zcrypto.com/csx",
    description:
      "Intensive program from Andreessen Horowitz's crypto fund. Connects founders with capital, deep crypto expertise, and a cohort of leading Web3 teams. Covers product-market fit, tokenization, GTM, fundraising, regulatory.",
    location: "NYC (in-person)",
    focus: "Web3 founders, all stages",
    applyUrl: "https://a16zcrypto.com/csx",
    rolling: false,
    tags: ["a16z", "web3"],
  },
  {
    name: "Techstars Web3 Accelerator",
    organization: "Techstars",
    organizationUrl: "https://www.techstars.com/accelerators",
    description:
      "Web3-focused Techstars program. Three months of intensive mentorship, network access, and Techstars community for life.",
    duration: "3 months",
    investment: "$120k convertible note (standard Techstars terms)",
    investmentUsd: 120000,
    location: "Multiple hubs",
    focus: "Web3 / blockchain startups",
    applyUrl: "https://www.techstars.com/accelerators",
    rolling: false,
    tags: ["techstars", "web3"],
  },
  {
    name: "Berkeley Blockchain Xcelerator",
    organization: "Blockchain at Berkeley / Berkeley SkyDeck",
    organizationUrl: "https://blockchain.berkeley.edu/xcelerator/",
    description:
      "University-affiliated accelerator running annual cohorts of blockchain/crypto startups. No equity taken, broad mentor network from Berkeley alumni in the space.",
    duration: "~4 months",
    investment: "No equity taken",
    location: "Berkeley, CA + Remote",
    focus: "Blockchain / crypto, pre-seed to seed",
    applyUrl: "https://blockchain.berkeley.edu/xcelerator/",
    rolling: false,
    tags: ["university", "blockchain"],
  },
  {
    name: "DevLabs",
    organization: "DevLabs",
    organizationUrl: "https://www.devlabs.club/",
    description:
      "Home for early builders — student founders and young entrepreneurs turning early ideas into companies. Runs DevHacks (hackathons), DevHouse (in-person builder houses incl. DevHouse SF), and DevSpace. 600+ builders, 50+ startups, 170+ projects, over $125k in collective funding. Recently launched a startup program with a16z, Kickstart, and Antler.",
    location: "Arizona (ASU-affiliated) + DevHouse SF",
    focus: "Student / early-career founders, all stages",
    applyUrl: "https://www.devlabs.club/",
    rolling: true,
    tags: ["students", "early-stage", "hackathons", "community"],
  },
  {
    name: "Okara Growth Accelerator",
    organization: "Okara",
    organizationUrl: "https://www.global.vc/founders/okara",
    description:
      "First cohort. 6-week program helping early-stage SaaS teams crack organic growth and distribution by working alongside the Okara team and a hand-picked group of founders, using AI-powered distribution. For SaaS companies started within the last 12 months, teams of 1–50. Founders must commit to using the Okara AI CMO paid plan throughout. Limited spots, selection at Okara's discretion. Featured company stories may be used in Okara case studies and marketing.",
    duration: "6 weeks",
    focus: "Early-stage SaaS (<12 months old), AI-powered organic growth + distribution",
    applyUrl:
      "https://docs.google.com/forms/d/e/1FAIpQLSf3tTxD-tgw0fitwmVI1NlAmpZzouE0pUrTTf602qvqxJE8kA/viewform",
    rolling: false,
    tags: ["saas", "growth", "ai", "distribution"],
  },
  {
    name: "Binance Labs Incubation",
    organization: "Binance Labs",
    organizationUrl: "https://labs.binance.com/en/incubation",
    description:
      "Season-based incubator program from Binance Labs. Token economy design support, investment from Binance Labs, and access to the Binance ecosystem of exchanges, BNB Chain, and partner protocols.",
    location: "Remote with in-person events",
    focus: "Early-stage crypto + Web3",
    applyUrl: "https://labs.binance.com/en/incubation",
    rolling: false,
    tags: ["binance", "incubator"],
  },
  {
    name: "Y Combinator",
    organization: "Y Combinator",
    organizationUrl: "https://www.ycombinator.com/",
    description:
      "Original 3-month startup accelerator. Twice-yearly batches (Summer/Winter) in San Francisco — weekly group office hours with partners, in-person kickoff, and access to the YC network of 5,000+ alumni. Crypto founders have shipped well-known protocols out of YC (Coinbase, OpenSea, Aztec, Helium, Avara/Aave, etc.). Late applications are accepted continuously after the batch deadline.",
    duration: "3 months (in-person SF)",
    investment:
      "$500k standard deal: $125k for 7% on a post-money SAFE + $375k uncapped MFN SAFE",
    investmentUsd: 500000,
    location: "San Francisco (in-person required)",
    focus: "Any sector, including crypto/web3 — early-stage founders",
    applyUrl: "https://www.ycombinator.com/apply",
    rolling: true,
    tags: ["yc", "general", "early-stage", "founders"],
  },
  {
    name: "Z Fellows",
    organization: "Z Fellows",
    organizationUrl: "https://www.zfellows.com/",
    description:
      "One-week experience pairing ten builders per cohort with founders of billion-dollar companies. Sector-agnostic (crypto, AI, infra, climate, fintech, etc.). Mentorship continues post-program for the life of the company. Open to high-school dropouts, students, employees, or any builder with a side project.",
    duration: "1 week (final day in-person SF or NYC)",
    investment: "Optional $10k at $1B uncapped valuation cap (no obligation to take it)",
    investmentUsd: 10000,
    location: "Virtual cohorts; in-person final day in SF or NYC",
    focus: "Early-stage founders & technical builders — crypto explicitly listed",
    applyUrl: "https://www.zfellows.com/",
    rolling: true,
    tags: ["fellowship", "general", "crypto", "ai", "early-stage"],
  },
  {
    name: "Paradigm Fellowship 2026",
    organization: "Paradigm",
    organizationUrl: "https://paradigm.xyz/fellowship-2026",
    description:
      "4-day retreat in Northern California (Aug 12–15, 2026) for early-career technical builders. Tracks span AI, robotics, energy, aerospace, bio, prediction markets, crypto. Firesides, whiteboarding, and hacking with Paradigm partners and past fellows from OpenAI, SpaceX, Citadel, Kalshi. Travel, lodging, and meals fully covered.",
    duration: "4 days (Aug 12–15, 2026)",
    investment: "Travel, lodging, and meals covered (non-dilutive)",
    location: "Northern California (in-person)",
    focus: "Early, deeply technical builders across frontiers including crypto + prediction markets",
    applyUrl: "https://paradigm.xyz/fellowship-2026",
    nextDeadline: "2026-06-08T23:59:00Z",
    rolling: false,
    tags: ["paradigm", "fellowship", "crypto", "research", "early-career"],
  },
  {
    name: "Neo Residency",
    organization: "Neo",
    organizationUrl: "https://neo.com/accelerator",
    description:
      "Selective Ali Partovi accelerator replacing the prior Neo Accelerator — a curated cohort of up to 20 startups and student teams per year. 3 months side-by-side at Neo's San Francisco workspace plus an all-expenses-paid 2-week Oregon bootcamp. Demo Day and bespoke VC intros at the end. Every founder/student also gets a profit share in the Neo fund. Startup perks include $450K+ of Azure, AWS, and OpenAI credits ($100K+ for student teams). 2026 deadline has passed but late applications are still reviewed.",
    duration: "3 months SF + 2 weeks Oregon bootcamp",
    investment:
      "Startups: $750k uncapped SAFE; Neo takes participation rights up to 5% ownership in the next priced equity round. Student teams: $40k each, no-strings; Neo retains right to invest on the same startup terms if the project becomes a company. All participants receive a profit share in the Neo fund.",
    investmentUsd: 750000,
    location: "San Francisco (in-person) + Oregon bootcamp",
    focus: "Top technical founders & student builders — sector-agnostic; strong crypto-adjacent alumni network",
    applyUrl: "https://neo.com/accelerator",
    rolling: true,
    tags: ["neo", "low-dilution", "fellowship", "general", "students"],
  },
  {
    name: "The Pitch by Deel",
    organization: "Deel",
    organizationUrl: "https://www.deel.com/the-pitch-by-deel/",
    description:
      "Global pitch tournament: 5-minute online application, regional finals in Tel Aviv, Dubai, Singapore, Berlin, London, Paris, and New York (March–May 2026), then a global finale. Up to 100 regional winners receive a $50k SAFE; up to 10 Global Champions win a $1M SAFE. All applicants get free access to the Deel startup-perks marketplace and online founder community. Travel to the global finale is covered for finalists.",
    duration: "Regional final + global finale (single-event format)",
    investment:
      "Regional winners: $50k SAFE. Global Champions: $1M SAFE (up to 10 winners).",
    investmentUsd: 50000,
    location: "7 regional cities (Tel Aviv, Dubai, Singapore, Berlin, London, Paris, NYC) + global finale",
    focus: "Pre-seed → Series A across any industry — must have full-time founders and a registered legal entity",
    applyUrl: "https://www.deel.com/the-pitch-by-deel/",
    rolling: true,
    tags: ["pitch-competition", "deel", "global", "safe", "any-stage"],
  },
  {
    name: "World Build Labs",
    organization: "Tools for Humanity / World",
    organizationUrl: "https://worldbuildlabs.com/",
    description:
      "5-month founder program for teams building on World (World ID, World App, World Chain on the OP Stack). Includes a Build Week in Seoul (May 10–18, 2026), a virtual program May–August, and a Demo Day at Tools for Humanity HQ in San Francisco. Travel funded; access to World's 38M+ verified-human user base on deployment.",
    duration: "5 months (May–August 2026)",
    investment:
      "Up to $200k in grant funding per team; 50+ hours of mentorship; fully funded travel for Build Week + Demo Day",
    investmentUsd: 200000,
    location: "Hybrid — Seoul (Build Week) + Virtual + SF (Demo Day)",
    focus: "Apps built on World ID, World App, and World Chain",
    applyUrl: "https://worldbuildlabs.com/",
    rolling: false,
    tags: ["world", "worldcoin", "world-chain", "identity", "op-stack"],
  },
  {
    name: "Encode Club Bootcamps",
    organization: "Encode Club",
    organizationUrl: "https://www.encodeclub.com/",
    description:
      "Free, sponsor-funded bootcamps across Solidity, Solana, ZK, AI, and ecosystem-specific stacks (Polkadot, Optimism, Aleph Zero, Hyperliquid, and others). Application-gated but no tuition and no equity — Encode is backed by foundation and protocol sponsors. Graduates feed Encode's hackathon circuit, hiring board, and a 50k+ builder Discord. One of the most accessible on-ramps into a serious crypto-builder alumni network for devs without YC/a16z-tier credentials.",
    duration: "6–8 weeks typical per bootcamp",
    location: "Remote (some London in-person cohorts)",
    focus: "Crypto + AI bootcamps for new and intermediate devs",
    applyUrl: "https://www.encodeclub.com/programmes",
    rolling: true,
    tags: ["encode", "bootcamp", "education", "community", "crypto", "ai"],
  },

  // === AI-native accelerators (added 2026-05-17) ===
  {
    name: "AI Grant (Batch 4)",
    organization: "AI Grant",
    organizationUrl: "https://aigrant.com/",
    description:
      "Daniel Gross + Nat Friedman's AI accelerator. $250k uncapped SAFE plus $350k in Microsoft Azure credits and $250k in partner credits (Anthropic, OpenAI, Modal, Replicate, PostHog). Past batches funded Perplexity, Cursor, ElevenLabs. Globally open, single founders accepted, no credentials required.",
    investment: "$250k SAFE + ~$600k in cloud/API credits",
    investmentUsd: 250000,
    location: "Remote (global)",
    focus: "Seed-stage AI startups",
    applyUrl: "https://aigrant.com/",
    rolling: true,
    tags: ["ai", "seed", "credits", "global", "frontier"],
  },
  {
    name: "a16z Speedrun SR007",
    organization: "Andreessen Horowitz",
    organizationUrl: "https://speedrun.a16z.com/",
    description:
      "a16z's intensive 12-week SF startup accelerator. SR007 runs Jul 27 – Oct 11, 2026 in-person. Up to $1M investment per company + ~$5M in credits across AWS, GCP, OpenAI, Azure, NVIDIA, Stripe, Deel. 87% of recent SR006 cohort was AI-focused. Acceptance rate <0.4%; 60–70 teams per batch.",
    duration: "12 weeks (Jul 27 – Oct 11, 2026)",
    investment: "Up to $1M + ~$5M in partner credits",
    investmentUsd: 1000000,
    location: "San Francisco (in-person required)",
    focus: "AI, games, consumer, ambitious early-stage",
    applyUrl: "https://speedrun.a16z.com/apply",
    nextDeadline: "2026-05-17T23:59:00Z",
    rolling: false,
    tags: ["a16z", "ai", "games", "sf", "speedrun"],
  },
  {
    name: "Sequoia Arc",
    organization: "Sequoia Capital",
    organizationUrl: "https://sequoiacap.com/arc/",
    description:
      "Sequoia's bi-annual 7-week company-building immersion for pre-seed / seed founders. ~10 companies per cohort in Menlo Park or London. Spring + Fall windows; Spring 2026 deadline already passed — sign up via the Sequoia site for Fall 2026 notifications.",
    duration: "7 weeks (twice yearly)",
    investment: "Up to $1M check, terms per company",
    investmentUsd: 1000000,
    location: "Menlo Park or London",
    focus: "Outlier pre-seed / seed founders — AI, crypto, generalist",
    applyUrl: "https://sequoiacap.com/arc/apply/",
    rolling: false,
    tags: ["sequoia", "outlier", "early-stage", "arc"],
  },
  {
    name: "AGI House Fellowship",
    organization: "AGI House",
    organizationUrl: "https://agihouse.org/",
    description:
      "Merit-based AI founder + researcher residency at AGI House Hillsborough, CA. Founded by Jeremy Nixon and Andrej Karpathy. Hosts founder events, invests in early-stage AI builders, connects residents to frontier-AI problem owners. Access is merit-based; community events are free.",
    location: "Hillsborough, CA (Bay Area)",
    focus: "Frontier AI founders and researchers",
    applyUrl: "https://agihouse.org/",
    rolling: true,
    tags: ["agi-house", "ai", "founders", "residency", "sf"],
  },
  {
    name: "Coinbase Ventures Builder Program",
    organization: "Coinbase",
    organizationUrl: "https://www.coinbase.com/developer-platform",
    description:
      "Coinbase's developer + founder program for builders shipping on Base and the broader Coinbase Developer Platform stack (CDP, Smart Wallet, OnchainKit, AgentKit, x402 payments). Combines protocol-level credits, GTM access via Coinbase's distribution, and warm intros into Coinbase Ventures' check pipeline.",
    location: "Remote (global)",
    focus: "Builders on Base / Coinbase Developer Platform",
    applyUrl: "https://www.coinbase.com/developer-platform",
    rolling: true,
    tags: ["coinbase", "base", "ventures", "cdp", "agentkit"],
  },
  {
    name: "1752 Lightning Round",
    organization: "1752vc",
    organizationUrl: "https://www.1752.vc/",
    description:
      "Recurring remote pitch competition from 1752vc (Southern California) for AI-first B2B founders with traction — revenue, pilots, active users, or enterprise demand. Top 5 finalists pitch live on Zoom (7-minute pitch + 5-minute Q&A); winner takes a $100k investment and a fast-track into 1752 Accelerate. All finalists get press distribution, newsletter spotlight (100k+ subs), and access to a $1M+ perks package.",
    investment:
      "$100k investment for the winner; finalist fast-track into 1752 Accelerate",
    investmentUsd: 100000,
    location: "Remote (Zoom)",
    focus: "AI-first B2B founders with meaningful traction",
    applyUrl: "https://www.sparkxyz.io/applications/1842",
    rolling: true,
    tags: ["1752", "ai", "b2b", "saas", "pitch-competition"],
  },

  // === Added 2026-05-19 — incubator sweep ===
  {
    name: "Founder School FS26-2",
    organization: "Founder School",
    organizationUrl: "https://founder.founderschool.build/",
    description:
      "10-week equity-free cohort program (Jun 19 – Aug 27, 2026) for founders building and monetizing products with AI and Web3. 50 spots, scored on AI/Web3 at the core + real-world problem fit. Partners: Protocol Labs, Odisea, Crecimiento, Rather Labs, Lisk, GCP, AWS. Mentorship + networking + ecosystem credits, no financial commitment.",
    duration: "10 weeks (Jun 19 – Aug 27, 2026)",
    investment: "Equity-free; ecosystem credits + mentorship",
    location: "Remote (global)",
    focus: "AI + Web3 founders solving real-world problems",
    applyUrl:
      "https://docs.google.com/forms/d/e/1FAIpQLSeC55SDLg9ZH8uwP1l2nJjeEFFr-IwZNTz5wQAfC37bxNe3vw/viewform",
    rolling: false,
    tags: ["founder-school", "ai", "web3", "equity-free", "protocol-labs"],
  },
  {
    name: "HF0 (Hacker Fellowship Zero)",
    organization: "HF0",
    organizationUrl: "https://www.hf0.com/",
    description:
      "Residential 12-week SF founder retreat for a small cohort of repeat builders. Lodging, meals, and cleaning provided so founders ship full-time. Mentor network of unicorn founders; community continues for life. Sector-agnostic — crypto, AI, infra, fintech.",
    duration: "12 weeks (in-person SF)",
    investment: "$500k on standard terms; residential costs covered",
    investmentUsd: 500000,
    location: "San Francisco (in-person, residential)",
    focus: "Repeat / senior technical founders across crypto, AI, infra",
    applyUrl: "https://www.hf0.com/",
    rolling: false,
    tags: ["hf0", "residency", "sf", "general", "repeat-founders"],
  },
  {
    name: "South Park Commons Founder Fellowship",
    organization: "South Park Commons",
    organizationUrl: "https://www.southparkcommons.com/founder-fellowship",
    description:
      "Pre-idea fellowship for technical founders in the 'in-between' phase — left a senior role, hunting for what to build next. Joins SPC's SF + NYC community of 350+ members. Open admission cycles year-round; sector-agnostic with strong AI + crypto representation.",
    duration: "Ongoing fellowship (typical engagement 6–12 months)",
    investment: "$400k for ~7% (SAFE) for founders who incorporate during the fellowship",
    investmentUsd: 400000,
    location: "San Francisco + NYC (in-person community)",
    focus: "Pre-idea technical founders — AI, crypto, frontier",
    applyUrl: "https://www.southparkcommons.com/founder-fellowship",
    rolling: true,
    tags: ["spc", "fellowship", "pre-idea", "ai", "crypto", "community"],
  },
  {
    name: "Antler Residency",
    organization: "Antler",
    organizationUrl: "https://www.antler.co/",
    description:
      "Global day-zero founder residency across 25+ locations (NYC, London, Singapore, Berlin, Austin, Bangalore, others). 6-month structure: 2-month cofounder-matching + business-building phase, then investment committee for residency-graduate teams. Stipend during residency; equity check on conviction.",
    duration: "~6 months per location",
    investment: "Pre-investment stipend; ~$100k–$250k for ~10% on conviction",
    investmentUsd: 100000,
    location: "25+ global locations (in-person required)",
    focus: "Day-zero founders, sector-agnostic incl. AI + Web3",
    applyUrl: "https://www.antler.co/apply",
    rolling: true,
    tags: ["antler", "day-zero", "cofounder-matching", "global"],
  },
  {
    name: "Entrepreneur First (EF)",
    organization: "Entrepreneur First",
    organizationUrl: "https://www.joinef.com/",
    description:
      "Talent investor: finds outliers before they have a cofounder or an idea. Cohorts in London, Paris, Bangalore, Singapore, NYC, SF. Form Stage builds the team + idea; Launch Stage invests once an entity exists. AI-heavy thesis; crypto founders accepted.",
    duration: "~6 months (Form + Launch)",
    investment: "Stipend in Form Stage; ~$250k investment in Launch Stage",
    investmentUsd: 250000,
    location: "London, Paris, Bangalore, Singapore, NYC, SF (in-person)",
    focus: "Outlier individuals pre-cofounder / pre-idea — AI weighted",
    applyUrl: "https://www.joinef.com/apply",
    rolling: true,
    tags: ["ef", "talent-investor", "ai", "cofounder-matching", "global"],
  },
  {
    name: "PearX",
    organization: "Pear VC",
    organizationUrl: "https://pear.vc/pearx/",
    description:
      "Pear VC's pre-seed accelerator. 14-week SF program for early-stage technical teams. ~20 companies per batch. AI, dev tools, vertical SaaS, healthtech, fintech. Demo Day to top-tier seed funds.",
    duration: "14 weeks (in-person SF)",
    investment: "Up to $250k pre-seed investment + Demo Day intros",
    investmentUsd: 250000,
    location: "San Francisco (in-person required)",
    focus: "Pre-seed technical teams — AI, dev tools, vertical SaaS",
    applyUrl: "https://pear.vc/pearx/",
    rolling: false,
    tags: ["pear", "pearx", "pre-seed", "sf", "ai"],
  },
  {
    name: "Thiel Fellowship",
    organization: "Thiel Foundation",
    organizationUrl: "https://thielfellowship.org/",
    description:
      "$200k over 2 years for builders 22 or younger who skip or leave college to work on technology. Annual cohort of ~20. Sector-agnostic — past fellows founded Ethereum (Vitalik), Figma, Luminar, OYO, Loom. No equity taken.",
    duration: "2 years",
    investment: "$200,000 grant, no equity",
    investmentUsd: 200000,
    location: "Remote (SF events)",
    focus: "Builders under 23 — sector-agnostic, technology-forward",
    applyUrl: "https://thielfellowship.org/",
    rolling: false,
    tags: ["thiel", "fellowship", "under-23", "non-equity", "general"],
  },
  {
    name: "776 Foundation Fellowship",
    organization: "Seven Seven Six (Alexis Ohanian)",
    organizationUrl: "https://www.sevensevensix.com/776-foundation",
    description:
      "$100k non-dilutive grant for builders 23 or younger working on climate / planet-positive technology. Annual cohort of 20. Mentorship and access to the 776 founder network. Originally crypto-funded (1/12 ETH per fellow at launch).",
    duration: "2 years",
    investment: "$100,000 grant, no equity",
    investmentUsd: 100000,
    location: "Remote (US/Canada residency)",
    focus: "Climate / planet-positive technology builders under 24",
    applyUrl: "https://www.sevensevensix.com/776-foundation",
    rolling: false,
    tags: ["776", "ohanian", "fellowship", "climate", "under-24", "non-equity"],
  },
  {
    name: "Berkeley SkyDeck",
    organization: "UC Berkeley",
    organizationUrl: "https://skydeck.berkeley.edu/",
    description:
      "UC Berkeley's flagship accelerator. HotDesk + Pad-13 cohort tiers; Pad-13 is the funded track. 6-month program with 200+ advisors, Demo Day to 500+ investors. Strong AI, deep tech, climate representation.",
    duration: "6 months",
    investment: "Pad-13: $200k for 5% via the Berkeley SkyDeck Fund",
    investmentUsd: 200000,
    location: "Berkeley, CA (hybrid)",
    focus: "Global startups across AI, deep tech, climate, software",
    applyUrl: "https://skydeck.berkeley.edu/apply/",
    rolling: false,
    tags: ["skydeck", "berkeley", "university", "ai", "deep-tech"],
  },
  {
    name: "Stanford StartX",
    organization: "Stanford StartX",
    organizationUrl: "https://startx.com/",
    description:
      "Non-profit accelerator for Stanford-affiliated founders. No equity, no fees. Continuous admission, fellowship for life. 1,200+ alum companies — Patreon, Lambda Labs, Rippling, others.",
    duration: "Ongoing (3-month core program + lifetime fellowship)",
    investment: "Non-equity; access to StartX Fund follow-on capital",
    location: "Palo Alto, CA (hybrid)",
    focus: "Stanford-affiliated founders (student/alum/faculty), sector-agnostic",
    applyUrl: "https://startx.com/apply",
    rolling: true,
    tags: ["startx", "stanford", "university", "non-equity"],
  },
  {
    name: "MassChallenge",
    organization: "MassChallenge",
    organizationUrl: "https://masschallenge.org/",
    description:
      "Non-profit accelerator with cohorts in Boston, Houston, Mexico City, Switzerland, and Israel. Zero equity, zero fees. ~$2M+ in equity-free cash awards per cohort. Mentorship-heavy; broad sector coverage incl. fintech and Web3.",
    duration: "~4 months per cohort",
    investment: "Non-equity; equity-free award pool ($50k–$100k typical winners)",
    investmentUsd: 50000,
    location: "Boston / Houston / Mexico City / Switzerland / Israel",
    focus: "Sector-agnostic — fintech, climate, health, Web3",
    applyUrl: "https://masschallenge.org/apply",
    rolling: false,
    tags: ["masschallenge", "non-equity", "global", "mentorship"],
  },
  {
    name: "500 Global Flagship Accelerator",
    organization: "500 Global",
    organizationUrl: "https://500.co/accelerator",
    description:
      "Formerly 500 Startups. Global multi-stage accelerator: Flagship (San Francisco), MENA, SEA, Japan, India, Korea. Crypto/Web3 founders accepted in the Flagship program; standard accelerator terms.",
    duration: "~3–4 months per program",
    investment: "Standard $150k for 6% (varies by program)",
    investmentUsd: 150000,
    location: "San Francisco + 6 regional programs",
    focus: "Multi-stage seed + Series A, sector-agnostic",
    applyUrl: "https://500.co/accelerator",
    rolling: true,
    tags: ["500-global", "global", "accelerator", "seed"],
  },
  {
    name: "Plug and Play",
    organization: "Plug and Play Tech Center",
    organizationUrl: "https://www.plugandplaytechcenter.com/",
    description:
      "Sunnyvale-based global accelerator with 30+ vertical programs (fintech, crypto, mobility, supply chain, health, climate). Corporate-partnered tracks; equity terms negotiated per program. Crypto program ('Crypto and Digital Assets') accepts cohorts across Sunnyvale, Abu Dhabi, and remote.",
    duration: "3 months per vertical batch",
    investment: "Varies by program; equity terms negotiated",
    location: "Sunnyvale, CA + 35+ global locations",
    focus: "Vertical-themed cohorts incl. crypto / digital assets",
    applyUrl: "https://www.plugandplaytechcenter.com/startups/",
    rolling: true,
    tags: ["plug-and-play", "global", "corporate", "crypto", "fintech"],
  },
  {
    name: "Tenity",
    organization: "Tenity",
    organizationUrl: "https://www.tenity.com/",
    description:
      "Swiss fintech + crypto incubator (formerly F10). Programs in Zurich, Singapore, Madrid, Tallinn. Pre-seed Incubation Program (6 months, equity-free) and a Growth Program for revenue-stage teams. Corporate partners include SIX, Swiss Re, Vontobel, Generali.",
    duration: "6 months (Incubation); separate Growth program",
    investment: "Equity-free Incubation; cash on Growth program",
    location: "Zurich / Singapore / Madrid / Tallinn",
    focus: "Fintech + crypto + digital assets — early-stage",
    applyUrl: "https://www.tenity.com/programs",
    rolling: true,
    tags: ["tenity", "fintech", "crypto", "switzerland", "equity-free"],
  },
  {
    name: "Avalanche Codebase",
    organization: "Ava Labs / Avalanche Foundation",
    organizationUrl: "https://www.codebase.xyz/",
    description:
      "Avalanche's accelerator for builders shipping on Avalanche L1s and Subnets. Three cohorts a year; 8-week structure with mentorship from Ava Labs engineering + ecosystem teams. Open to founders bringing existing protocols cross-chain or building Avalanche-native.",
    duration: "8 weeks",
    investment: "Investment offered to top teams (per cohort terms)",
    location: "Remote with in-person sprints",
    focus: "Avalanche L1 / Subnet builders",
    applyUrl: "https://www.codebase.xyz/",
    rolling: false,
    tags: ["avalanche", "codebase", "ava-labs", "l1", "subnet"],
  },
  {
    name: "Polygon Village Bootcamp",
    organization: "Polygon Labs",
    organizationUrl: "https://polygon.technology/polygon-village",
    description:
      "Polygon's program for builders shipping on the Polygon stack (PoS, zkEVM, CDK chains). Combines grant funding, mentorship, technical credits, and GTM support across DeFi, gaming, RWA, identity.",
    location: "Remote (global)",
    focus: "Polygon ecosystem — DeFi, gaming, RWA, identity",
    applyUrl: "https://polygon.technology/polygon-village",
    rolling: true,
    tags: ["polygon", "village", "ecosystem", "grants"],
  },
  {
    name: "Crecimiento Builders Program",
    organization: "Crecimiento",
    organizationUrl: "https://crecimiento.build/",
    description:
      "LATAM-focused builder program centered in Buenos Aires. Combines hackathons, founder retreats, and an annual Devconnect-aligned conference. Strong overlap with Founder School and the Argentine crypto founder scene.",
    location: "Buenos Aires + LATAM (in-person)",
    focus: "LATAM crypto + AI founders, builders, devs",
    applyUrl: "https://crecimiento.build/",
    rolling: true,
    tags: ["crecimiento", "latam", "argentina", "crypto", "ai"],
  },
  {
    name: "Conviction Embed",
    organization: "Conviction (Sarah Guo)",
    organizationUrl: "https://embed.conviction.com/",
    description:
      "Sarah Guo's AI-focused founder program. Embedded, low-overhead support for technical builders pre-incorporation through seed. Heavy on weekly community + targeted intros into the frontier-AI investor stack.",
    location: "San Francisco + Remote",
    focus: "Frontier AI founders pre-incorporation → seed",
    applyUrl: "https://embed.conviction.com/",
    rolling: true,
    tags: ["conviction", "sarah-guo", "ai", "embed", "frontier"],
  },
  {
    name: "Buildspace Nights & Weekends",
    organization: "Buildspace",
    organizationUrl: "https://buildspace.so/",
    description:
      "6-week build-in-public sprints for makers shipping AI, crypto, and consumer side projects. Free; no equity. Each season closes with Demo Day. Pipeline into more selective Buildspace tracks (s5, etc.) for breakout teams.",
    duration: "6 weeks per season",
    investment: "Free; non-equity",
    location: "Remote (global)",
    focus: "Side-project builders shipping AI / crypto / consumer",
    applyUrl: "https://buildspace.so/",
    rolling: true,
    tags: ["buildspace", "ai", "crypto", "consumer", "non-equity"],
  },

  // === Chain-native accelerators (added 2026-05-19) ===
  {
    name: "BNB Chain MVB Accelerator",
    organization: "BNB Chain x YZi Labs x CMC Labs",
    organizationUrl: "https://www.bnbchain.org/en/programs/mvb",
    description:
      "4-week accelerator for early-stage builders on BNB Chain / opBNB / Greenfield. Web3-focused curriculum, demo day pitch to investors, selective YZi Labs investment for top teams, and intros to BNB ecosystem partners and service providers. Runs quarterly (Season 9 most recent). Recent seasons emphasize blockchain × AI intersection.",
    duration: "4 weeks",
    investment: "Selective follow-on investment from YZi Labs",
    location: "Hybrid",
    focus: "BNB Chain early-stage builders — Web3, AI/blockchain",
    applyUrl: "https://www.bnbchain.org/en/programs/mvb",
    rolling: false,
    tags: ["bnb", "mvb", "yzi-labs", "cmc-labs", "ai"],
  },
  {
    name: "Monad Nitro",
    organization: "Monad Foundation",
    organizationUrl: "https://www.monad.foundation/",
    description:
      "3-month structured accelerator open to teams building on Monad or any other blockchain. Capital access, dedicated mentorship, and connections into Monad's Mainnet incentives / Momentum matching program for breakout dApps. Companion programs: Rebel in Paradise (AI hackathon, Jan–Feb 2026) and Blitz (1-day in-person hackathons in hubs globally).",
    duration: "3 months",
    location: "Hybrid",
    focus: "Capital + mentorship for performant EVM dApps",
    applyUrl: "https://www.monad.xyz/",
    rolling: false,
    tags: ["monad", "evm", "l1", "nitro"],
  },
  {
    name: "Movement Move Collective",
    organization: "Movement Network Foundation",
    organizationUrl: "https://www.movementnetwork.xyz/grants",
    description:
      "$100M+ in-house accelerator for the MoveVM ecosystem on Movement Network. Combines Foundation grants + Movement-administered audits + GTM support, and routes top teams through structured development → market launch. Targets top talent and real-world projects on M2 + downstream Move L2s.",
    investment: "Programmatic — drawn from the $100M+ Move Collective fund",
    location: "Hybrid",
    focus: "MoveVM on Movement — DeFi, infra, Move L2 launches",
    applyUrl: "https://www.movementnetwork.xyz/grants",
    rolling: true,
    tags: ["movement", "move", "moveVM", "l2", "collective"],
  },
  {
    name: "Cronos Accelerator",
    organization: "Cronos Labs",
    organizationUrl: "https://www.cronoslabs.org/accelerator",
    description:
      "Accelerator for end-user dApps with a working product and several hundred DAU on Cronos EVM / zkEVM, planning a token launch. Milestone-tranched grants up to $50K USD ($5K–$10K per milestone), plus up to $300K follow-on from the $100M Cronos Labs ecosystem fund and Crypto.com Capital. Note: program activity has fluctuated — verify intake status before applying.",
    investment: "Up to $50K grant + up to $300K follow-on",
    investmentUsd: 50000,
    location: "Remote",
    focus: "Cronos EVM/zkEVM — consumer dApps with traction",
    applyUrl: "https://www.cronoslabs.org/accelerator",
    rolling: true,
    tags: ["cronos", "cro", "evm", "consumer"],
  },
  {
    name: "SuiHub Global Accelerator",
    organization: "Sui Foundation / SuiHub",
    organizationUrl: "https://www.sui.io/programs-funding",
    description:
      "12-week accelerator for pre-token MVP teams building on Sui — Move-based DeFi, gaming, social, payments. Up to $200K per cohort plus technical mentorship, marketing support, and intros into Sui's investor + partner network. MENA-hub launch followed by global expansion.",
    duration: "12 weeks",
    investment: "Up to $200K per cohort",
    investmentUsd: 200000,
    location: "MENA + global hybrid",
    focus: "Pre-token MVP teams on Sui — DeFi, gaming, social",
    applyUrl: "https://www.sui.io/programs-funding",
    rolling: false,
    tags: ["sui", "suihub", "move", "gaming", "defi"],
  },
  {
    name: "Aptos Horizon",
    organization: "Aptos Foundation x OKX Ventures x Ankaa",
    organizationUrl: "https://aptosfoundation.org/grants",
    description:
      "10-week accelerator launched jointly with OKX Ventures and Ankaa, drawing from a $10M Aptos ecosystem growth fund. Venture support, focused mentorship, GTM exposure, and access to the Aptos partner network for Move-language teams building DeFi, gaming, and consumer dApps.",
    duration: "10 weeks",
    investment: "Drawn from $10M Aptos x OKX Ventures fund",
    location: "Hybrid",
    focus: "Aptos / Move — DeFi, gaming, consumer dApps",
    applyUrl: "https://aptosfoundation.org/grants",
    rolling: false,
    tags: ["aptos", "apt", "move", "horizon", "okx-ventures"],
  },
  {
    name: "ICP HUB Accelerator",
    organization: "ICP HUBs Network (DFINITY-aligned)",
    organizationUrl: "https://internetcomputer.org/education-hub",
    description:
      "3-month regional accelerators run by ICP HUBs in 30+ countries. Three phases: technical foundations → product development → market/investor prep. ICP HUB North America offers secured grants up to $100K plus incubation; regional Waves3 (Portugal) and ICP HUB USA programs run on cohort cadence. Pipeline produced fully-audited ICP wallet (NFID) and 25K-user DecideAI launch.",
    duration: "3 months",
    investment: "Up to $100K (region-dependent)",
    investmentUsd: 100000,
    location: "30+ regional hubs (NA, EU, LATAM, MENA, APAC)",
    focus: "Internet Computer dApps — global regional rollout",
    applyUrl: "https://icpnorthamerica.org/",
    rolling: false,
    tags: ["icp", "internet-computer", "dfinity", "icp-hub", "regional"],
  },
  {
    name: "Bitcoin Frontier Fund Accelerator",
    organization: "Bitcoin Frontier Fund (formerly Stacks Accelerator)",
    organizationUrl: "https://btcfrontier.fund/accelerator.html",
    description:
      "3-month accelerator + investor for founders building anywhere in the Bitcoin ecosystem — Bitcoin L1, Lightning, Stacks, Rootstock, Ordinals, DLCs, BitVM. Up to $50K invested with no valuation cap. Demo day with hundreds of BTC-focused investors. Cohort 4+ have run; thesis expanded beyond Stacks after BFF rebrand.",
    duration: "3 months",
    investment: "Up to $50K, no valuation cap",
    investmentUsd: 50000,
    location: "Hybrid",
    focus: "Bitcoin ecosystem — L1, Lightning, Stacks, BitVM, Ordinals",
    applyUrl: "https://btcfrontier.fund/accelerator.html",
    rolling: false,
    tags: ["bitcoin-frontier-fund", "bff", "bitcoin", "stacks", "lightning", "bitvm"],
  },
];
// Ambassador / champion / fellow programs live in scripts/seed-ambassadors.ts.

async function upsert(payload: AcceleratorPayload) {
  const existing = await db
    .select({ id: submissions.id, publicId: submissions.publicId })
    .from(submissions)
    .where(
      and(
        eq(submissions.type, "accelerator"),
        sql`${submissions.payload}->>'name' = ${payload.name}`,
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
      type: "accelerator",
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
  for (const a of accelerators) {
    const r = await upsert(a);
    if (r.action === "inserted") inserted++;
    else updated++;
    console.log(`  ${r.action.padEnd(8)} /accelerators/${r.publicId}  ${a.name}`);
  }
  console.log(
    `\n✓ ${accelerators.length} accelerators processed (${inserted} new, ${updated} updated).`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
