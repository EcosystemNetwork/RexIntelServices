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
