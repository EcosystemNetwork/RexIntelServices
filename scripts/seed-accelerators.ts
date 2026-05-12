/**
 * Run with: npx tsx scripts/seed-accelerators.ts
 *
 * Seeds known active crypto accelerator / incubator programs into
 * /accelerators. Sourced from alliance.xyz, outlierventures.io/base-camp,
 * orangedao.xyz (scraped 2026-05-10), and well-known programs supplemented
 * from public info where the homepage was uncooperative.
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
];

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
