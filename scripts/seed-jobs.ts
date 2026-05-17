/**
 * Run with: npx tsx scripts/seed-jobs.ts
 *
 * Seeds a hand-curated set of open roles at major crypto teams to populate
 * /jobs on launch. Live ATS boards (Greenhouse / Ashby) blocked us during
 * scrape, so these are intentionally minimal pointers — title, company,
 * canonical apply page, broad description — that link off-site for the
 * actual JD. Refresh whenever roles close.
 *
 * Set status to "approved" + publishedAt now so they appear immediately.
 * Idempotent: name-match by (company, title).
 */
import "dotenv/config";
import { and, eq, sql } from "drizzle-orm";
import { db, submissions } from "../src/lib/db";
import type { JobPayload } from "../src/lib/db/schema";

const jobs: JobPayload[] = [
  {
    title: "Smart Contract Engineering — Open Roles",
    company: "Optimism",
    companyUrl: "https://www.optimism.io/",
    description:
      "OP Labs is hiring across Solidity, Go, and protocol research. Building the OP Stack — the open-source rollup framework powering Optimism Mainnet, Base, and the Superchain.",
    location: "Remote (Global)",
    remote: true,
    employmentType: "full-time",
    applyUrl: "https://job-boards.greenhouse.io/optimismpbc",
    tags: ["solidity", "go", "l2", "protocol"],
  },
  {
    title: "Open Roles — All Functions",
    company: "Coinbase",
    companyUrl: "https://www.coinbase.com/careers",
    description:
      "Coinbase is hiring across product, engineering, design, security, and operations. The largest crypto exchange in the US, plus Base L2.",
    location: "Remote-first (US-eligible roles)",
    remote: true,
    employmentType: "full-time",
    applyUrl: "https://www.coinbase.com/careers/positions",
    tags: ["exchange", "base", "consumer"],
  },
  {
    title: "Engineering, Research & Product — Open Roles",
    company: "Uniswap Labs",
    companyUrl: "https://uniswap.org/",
    description:
      "Uniswap Labs builds the Uniswap Protocol, Unichain, and frontend products used by millions. Hiring across protocol engineering, security, frontend, and research.",
    location: "Remote (Global)",
    remote: true,
    employmentType: "full-time",
    applyUrl: "https://jobs.ashbyhq.com/Uniswap",
    tags: ["defi", "uniswap", "v4"],
  },
  {
    title: "Open Roles — Core Engineering",
    company: "Polygon Labs",
    companyUrl: "https://polygon.technology/",
    description:
      "Polygon Labs builds Polygon PoS, zkEVM, and Polygon CDK. Hiring across Rust, Go, protocol research, and developer-experience tooling.",
    location: "Remote (Global)",
    remote: true,
    employmentType: "full-time",
    applyUrl: "https://polygon.technology/careers",
    tags: ["zk", "rust", "polygon"],
  },
  {
    title: "Engineering, Research, Operations — Open Roles",
    company: "Paradigm",
    companyUrl: "https://www.paradigm.xyz/",
    description:
      "Paradigm is a research-driven crypto investment firm. Hiring across research, engineering (including Reth core team), and operations.",
    location: "San Francisco, NYC, Remote",
    remote: true,
    employmentType: "full-time",
    applyUrl: "https://www.paradigm.xyz/careers",
    tags: ["research", "rust", "reth"],
  },
  {
    title: "Open Roles",
    company: "Anchorage Digital",
    companyUrl: "https://www.anchorage.com/",
    description:
      "Federally chartered crypto bank. Hiring across engineering, security, compliance, and product for institutional custody, staking, and trading.",
    location: "Remote-first (US)",
    remote: true,
    employmentType: "full-time",
    applyUrl: "https://jobs.ashbyhq.com/anchorage",
    tags: ["custody", "institutional", "compliance"],
  },
  {
    title: "Open Roles",
    company: "Chainalysis",
    companyUrl: "https://www.chainalysis.com/",
    description:
      "Blockchain intelligence and analytics for government, financial institutions, and crypto companies. Hiring across engineering, data, and customer-facing roles.",
    location: "Remote + multiple offices",
    remote: true,
    employmentType: "full-time",
    applyUrl: "https://www.chainalysis.com/careers/",
    tags: ["intelligence", "analytics", "compliance"],
  },
  {
    title: "Engineering, Research, BD — Open Roles",
    company: "Worldcoin / Tools for Humanity",
    companyUrl: "https://worldcoin.org/",
    description:
      "Building World ID, World App, and the World Chain. Hiring across engineering, hardware, design, research, and BD globally.",
    location: "Remote + multiple offices",
    remote: true,
    employmentType: "full-time",
    applyUrl: "https://boards.greenhouse.io/toolsforhumanity",
    tags: ["identity", "consumer"],
  },
  {
    title: "Open Roles — Core Protocol",
    company: "Lido",
    companyUrl: "https://lido.fi/",
    description:
      "Liquid staking for Ethereum. Hiring across smart-contract engineering, protocol research, frontend, and validator operations.",
    location: "Remote (Global)",
    remote: true,
    employmentType: "full-time",
    applyUrl: "https://lido.fi/jobs",
    tags: ["staking", "ethereum", "solidity"],
  },
  {
    title: "Open Roles",
    company: "EigenLayer",
    companyUrl: "https://www.eigenlayer.xyz/",
    description:
      "Restaking primitive for Ethereum. Hiring across cryptography research, smart-contract engineering, infra, and BD for AVSs and operators.",
    location: "Remote + Seattle",
    remote: true,
    employmentType: "full-time",
    applyUrl: "https://www.eigenlayer.xyz/careers",
    tags: ["restaking", "ethereum", "research"],
  },
  {
    title: "Open Roles — Engineering & Research",
    company: "Starknet (StarkWare)",
    companyUrl: "https://starkware.co/",
    description:
      "ZK-rollup pioneers, building Starknet and the Stwo prover. Hiring across cryptography, Rust, Cairo, and protocol research.",
    location: "Remote + Israel",
    remote: true,
    employmentType: "full-time",
    applyUrl: "https://starkware.co/careers/",
    tags: ["zk", "rust", "cairo"],
  },
  {
    title: "Open Roles",
    company: "Privy",
    companyUrl: "https://www.privy.io/",
    description:
      "Auth + wallet infrastructure for crypto apps. Hiring across full-stack engineering, security, and developer relations.",
    location: "NYC + Remote",
    remote: true,
    employmentType: "full-time",
    applyUrl: "https://jobs.ashbyhq.com/Privy",
    tags: ["wallets", "auth", "developer-tools"],
  },
  {
    title: "Fellows Program — Research",
    company: "Anthropic",
    companyUrl: "https://www.anthropic.com/",
    description:
      "4-month full-time research fellowship with mentorship from senior Anthropic researchers. Five workstreams: AI Safety, AI Security, ML Systems & Performance, Reinforcement Learning, and Economics & Policy. Expected output is a public research artifact (typically a paper). Python fluency + strong CS/math/physics background; no prior research experience required.",
    location: "Remote (US, UK, Canada) — optional desk in Berkeley or London",
    remote: true,
    employmentType: "contract",
    seniority: "junior",
    compensation: "$3,850/wk USD ($2,310 GBP / $4,300 CAD) + ~$15k/mo compute",
    applyUrl: "https://job-boards.greenhouse.io/anthropic/jobs/5023394008",
    tags: ["ai-safety", "research", "fellowship", "ml", "rl"],
  },
  {
    title: "Open Roles — Engineering, Investigations, Data Science",
    company: "TRM Labs",
    companyUrl: "https://www.trmlabs.com/",
    description:
      "Blockchain intelligence for compliance, government, and financial-crime investigations. Hiring across backend, data science, investigations analysts, and threat-intel researchers. The most directly RexIntel-adjacent shop in this list.",
    location: "Remote-first (multiple geos)",
    remote: true,
    employmentType: "full-time",
    applyUrl: "https://www.trmlabs.com/careers",
    tags: ["compliance", "investigations", "data-science", "intelligence"],
  },
  {
    title: "Open Roles — Crypto Compliance & Investigations",
    company: "Elliptic",
    companyUrl: "https://www.elliptic.co/",
    description:
      "Blockchain analytics provider behind a large share of the public DPRK / Lazarus attribution work cited across the /intel lane. Hiring across engineering, intelligence research, sales, and customer success.",
    location: "London + Remote",
    remote: true,
    employmentType: "full-time",
    applyUrl: "https://www.elliptic.co/careers",
    tags: ["compliance", "investigations", "intelligence", "london"],
  },
  {
    title: "Open Roles — Security Research & Engineering",
    company: "Trail of Bits",
    companyUrl: "https://www.trailofbits.com/",
    description:
      "Top-tier security research firm specializing in smart-contract audits, cryptography review, and offensive security. Hiring across security engineering, blockchain audits, ML-security, and applied cryptography.",
    location: "Remote (US-friendly)",
    remote: true,
    employmentType: "full-time",
    applyUrl: "https://www.trailofbits.com/careers/",
    tags: ["security", "audit", "cryptography", "research"],
  },
  {
    title: "Open Roles — Smart Contract Auditing",
    company: "OpenZeppelin",
    companyUrl: "https://www.openzeppelin.com/",
    description:
      "Maintainers of the OpenZeppelin Contracts library plus a top-3 smart-contract audit practice. Hiring across audit engineering, Defender (security ops platform), and protocol research.",
    location: "Remote (Global)",
    remote: true,
    employmentType: "full-time",
    applyUrl: "https://www.openzeppelin.com/jobs",
    tags: ["security", "audit", "solidity", "defender"],
  },
  {
    title: "Open Roles — Security Engineering",
    company: "Halborn",
    companyUrl: "https://www.halborn.com/",
    description:
      "Web3 security firm running audits, pen tests, and on-call IR for protocols and exchanges. Authors of much of the public Lazarus-attribution analysis cited in /intel. Hiring across audit engineers, IR specialists, and detection engineers.",
    location: "Remote (Global)",
    remote: true,
    employmentType: "full-time",
    applyUrl: "https://www.halborn.com/careers",
    tags: ["security", "audit", "incident-response", "detection"],
  },
  {
    title: "Open Roles — Engineering, Product, Compliance",
    company: "Circle",
    companyUrl: "https://www.circle.com/",
    description:
      "USDC issuer. Hiring across engineering (backend, payments infra, smart contracts), product, security, and compliance. Especially strong stablecoin-policy and treasury-engineering teams.",
    location: "Remote-first (US + multiple offices)",
    remote: true,
    employmentType: "full-time",
    applyUrl: "https://www.circle.com/careers",
    tags: ["stablecoin", "usdc", "payments", "compliance"],
  },
  {
    title: "Open Roles — Engineering, Security, Operations",
    company: "Fireblocks",
    companyUrl: "https://www.fireblocks.com/",
    description:
      "Institutional digital-asset custody and MPC wallet infrastructure used by exchanges, banks, and treasuries. Hiring across MPC cryptography, backend systems, policy engineering, and security research.",
    location: "Remote + multiple offices",
    remote: true,
    employmentType: "full-time",
    applyUrl: "https://www.fireblocks.com/careers/",
    tags: ["custody", "mpc", "institutional", "security"],
  },
  {
    title: "Open Roles — Mobile, Backend, Security",
    company: "Phantom",
    companyUrl: "https://phantom.com/",
    description:
      "Multi-chain (Solana / EVM / Bitcoin) consumer wallet used by 10M+ people. Hiring across mobile (iOS/Android), backend, security engineering, and developer-platform roles.",
    location: "Remote-first",
    remote: true,
    employmentType: "full-time",
    applyUrl: "https://phantom.com/careers",
    tags: ["wallets", "solana", "evm", "consumer", "mobile"],
  },
  {
    title: "Open Roles — Backend, Infra, Developer Experience",
    company: "Alchemy",
    companyUrl: "https://www.alchemy.com/",
    description:
      "Multi-chain Web3 development platform — RPCs, indexers, account abstraction, embedded wallets. Hiring across distributed-systems infra, full-stack, smart-contract platform, and developer-experience teams.",
    location: "Remote + SF / NYC",
    remote: true,
    employmentType: "full-time",
    applyUrl: "https://www.alchemy.com/careers",
    tags: ["infra", "rpc", "developer-tools", "evm"],
  },
  {
    title: "Open Roles — Core Engineering, Validator Client",
    company: "Anza (Solana Labs spin-out)",
    companyUrl: "https://www.anza.xyz/",
    description:
      "Independent Solana protocol-engineering org spun out of Solana Labs. Maintains the Agave validator client. Hiring across Rust systems engineering, networking, consensus, and protocol research.",
    location: "Remote (Global)",
    remote: true,
    employmentType: "full-time",
    applyUrl: "https://jobs.ashbyhq.com/anza",
    tags: ["solana", "rust", "validator", "consensus"],
  },
  {
    title: "Open Roles — Engineering, Research, Product",
    company: "OpenAI",
    companyUrl: "https://openai.com/",
    description:
      "Frontier AI lab building GPT-class systems and the Sora video stack. Hiring across research engineering, safety, applied product, security, and infrastructure.",
    location: "San Francisco + Remote (some roles)",
    remote: true,
    employmentType: "full-time",
    applyUrl: "https://openai.com/careers/search",
    tags: ["ai", "research", "safety", "infra"],
  },
  {
    title: "Open Roles — Engineering, ML, Product",
    company: "Cursor (Anysphere)",
    companyUrl: "https://cursor.com/",
    description:
      "AI-native code editor used by a large share of frontier engineering teams. Hiring aggressively across ML engineering, applied research, full-stack, infra, and product. Famously high engineering bar.",
    location: "San Francisco (primarily in-person)",
    remote: false,
    employmentType: "full-time",
    applyUrl: "https://cursor.com/careers",
    tags: ["ai", "developer-tools", "ml", "san-francisco"],
  },
  {
    title: "Open Roles — Research, Engineering, Infrastructure",
    company: "Mistral AI",
    companyUrl: "https://mistral.ai/",
    description:
      "European frontier model lab building open-weight foundation models. Hiring across research, ML infrastructure, applied engineering, and enterprise platform teams. Strong open-source ethos.",
    location: "Paris + Remote (EU-friendly)",
    remote: true,
    employmentType: "full-time",
    applyUrl: "https://jobs.lever.co/mistral",
    tags: ["ai", "research", "open-weight", "europe"],
  },
];

async function upsert(payload: JobPayload) {
  const existing = await db
    .select({ id: submissions.id, publicId: submissions.publicId })
    .from(submissions)
    .where(
      and(
        eq(submissions.type, "job"),
        sql`${submissions.payload}->>'company' = ${payload.company}`,
        sql`${submissions.payload}->>'title' = ${payload.title}`,
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
      type: "job",
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
  for (const j of jobs) {
    const r = await upsert(j);
    if (r.action === "inserted") inserted++;
    else updated++;
    console.log(`  ${r.action.padEnd(8)} /jobs/${r.publicId}  ${j.company} — ${j.title}`);
  }
  console.log(
    `\n✓ ${jobs.length} jobs processed (${inserted} new, ${updated} updated).`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
