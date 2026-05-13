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
