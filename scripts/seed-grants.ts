/**
 * Run with: npx tsx scripts/seed-grants.ts
 *
 * Seeds active crypto grant programs into the /grants board. Sourced from
 * ethereum.org/community/grants, arbitrum.foundation/grants, solana.org/grants,
 * uniswapfoundation.org/build, and gitcoin.co/program (scraped 2026-05-10);
 * supplemented with a few well-known programs that weren't on those indexes.
 *
 * Idempotent: name-match upsert. Re-running refreshes content.
 *
 * Status policy: every entry below is approved + published. Aggregator
 * directories (Karma, MetaGov, etc.) were intentionally excluded — only
 * actual funding programs land here.
 */
import "dotenv/config";
import { and, eq, sql } from "drizzle-orm";
import { db, submissions } from "../src/lib/db";
import type { GrantPayload } from "../src/lib/db/schema";

const grants: GrantPayload[] = [
  {
    name: "EF Ecosystem Support Program",
    organization: "Ethereum Foundation",
    organizationUrl: "https://esp.ethereum.foundation",
    description:
      "Funding for open-source projects benefiting Ethereum — universal tools, infrastructure, research, and public goods. Rolling intake. 1,000+ projects funded to date.",
    focus: "Public goods, infrastructure, research",
    applyUrl: "https://esp.ethereum.foundation",
    rolling: true,
    tags: ["ethereum", "public-goods", "infra"],
  },
  {
    name: "Ethereum Academic Grants",
    organization: "Ethereum Foundation",
    organizationUrl: "https://esp.ethereum.foundation/academic-grants",
    description:
      "Grants supporting Ethereum-related academic work — cryptography, distributed systems, mechanism design, formal verification. Periodic rounds.",
    focus: "Academic research",
    applyUrl: "https://esp.ethereum.foundation/academic-grants",
    rolling: false,
    tags: ["ethereum", "research", "academia"],
  },
  {
    name: "Arbitrum Foundation Grant Program",
    organization: "Arbitrum Foundation",
    organizationUrl: "https://arbitrum.foundation/grants",
    description:
      "Milestones-based funding for dApps and infrastructure tools building on Arbitrum One, Nova, and Orbit. Rolling intake.",
    focus: "Arbitrum ecosystem dApps + infra",
    applyUrl:
      "https://arbitrumfoundation.notion.site/Grant-Application-Form-de318b3dfaea409abbf424c958b3724b",
    rolling: true,
    tags: ["arbitrum", "l2"],
  },
  {
    name: "Arbitrum Audit Program",
    organization: "Arbitrum Foundation",
    organizationUrl: "https://arbitrum.foundation/grants",
    description:
      "Subsidies for third-party smart-contract audits for early-stage projects building on Arbitrum. $10M in ARB allocated over 12 months.",
    amount: "$10M in ARB total",
    focus: "Smart-contract audit subsidies",
    applyUrl: "https://tally.so/r/3xzEzv?program=aap&ref=blog.arbitrum.foundation",
    rolling: true,
    tags: ["arbitrum", "audits", "security"],
  },
  {
    name: "ArbiFuel",
    organization: "Arbitrum Foundation",
    organizationUrl: "https://arbitrum.foundation/grants",
    description:
      "Gas-fee sponsorship for early-stage teams shipping on Arbitrum — covers user-onboarding gas so builders can iterate without absorbing the cost.",
    focus: "Gas sponsorship",
    applyUrl: "https://airtable.com/appzb4GfqGfrnDXjW/shrulGIIp6l6ezAlt",
    rolling: true,
    tags: ["arbitrum", "user-onboarding"],
  },
  {
    name: "Arbitrum Gaming Ventures",
    organization: "ArbitrumDAO",
    organizationUrl: "https://thegamingcatalyst.com",
    description:
      "Funding for gaming projects and gaming infrastructure on Arbitrum, deployed via The Gaming Catalyst.",
    focus: "Gaming, gaming infra",
    applyUrl: "https://thegamingcatalyst.com",
    rolling: true,
    tags: ["arbitrum", "gaming"],
  },
  {
    name: "Uniswap Foundation Grants",
    organization: "Uniswap Foundation",
    organizationUrl: "https://www.uniswapfoundation.org/build",
    description:
      "Funds teams building across the Uniswap ecosystem — protocols, tooling, research, governance, and community. Stage-agnostic, rolling intake.",
    focus: "Uniswap ecosystem",
    applyUrl: "https://share.hsforms.com/1fxQjPQTgTYmPwlYxxKlSGQsdca9",
    rolling: true,
    tags: ["uniswap", "defi"],
  },
  {
    name: "Unichain Grants",
    organization: "Uniswap Foundation",
    organizationUrl: "https://www.uniswapfoundation.org/build",
    description:
      "DeFi projects with $250K+ TVL and infrastructure projects can apply for product and GTM support on Unichain.",
    amount: "Up to $7.5K",
    focus: "Unichain DeFi + infra",
    applyUrl: "https://share.hsforms.com/18Kv3hTvDSt-x1wK9va0OYwsdca9",
    rolling: true,
    tags: ["unichain", "defi"],
  },
  {
    name: "UFSF Audit Subsidies",
    organization: "Uniswap Foundation",
    organizationUrl: "https://www.uniswapfoundation.org/build",
    description:
      "Audit subsidy support for Uniswap v4 hook projects. Rolling intake.",
    focus: "v4 hook audits",
    applyUrl: "https://areta.fillout.com/ufsf-projects",
    rolling: true,
    tags: ["uniswap", "v4", "hooks", "audits"],
  },
  {
    name: "Uniswap Hook Incubator",
    organization: "Uniswap Foundation",
    organizationUrl: "https://www.uniswapfoundation.org/build",
    description:
      "Free-tuition program to speedrun v4 expertise and ship your first Uniswap v4 hook.",
    amount: "Free tuition",
    focus: "v4 hook builders",
    applyUrl: "https://atrium.academy/uniswap",
    rolling: true,
    tags: ["uniswap", "v4", "hooks", "education"],
  },
  {
    name: "Solana Foundation Standard Grants",
    organization: "Solana Foundation",
    organizationUrl: "https://solana.org/grants",
    description:
      "Milestone-based grants for public-goods projects providing open-source contributions to the Solana ecosystem.",
    focus: "Public goods on Solana",
    applyUrl: "https://share.hsforms.com/1GE1hYdApQGaDiCgaiWMXHA5lohw",
    rolling: true,
    tags: ["solana", "public-goods"],
  },
  {
    name: "Solana Foundation Convertible Grants",
    organization: "Solana Foundation",
    organizationUrl: "https://solana.org/grants",
    description:
      "Milestone-based funding for projects with commercial components — convertible into equity or tokens if the project takes off.",
    focus: "Solana ecosystem startups",
    applyUrl: "https://share.hsforms.com/1GE1hYdApQGaDiCgaiWMXHA5lohw",
    rolling: true,
    tags: ["solana"],
  },
  {
    name: "Solana RFPs",
    organization: "Solana Foundation",
    organizationUrl: "https://solana.org/grants",
    description:
      "Funding for specific project ideas the Foundation actively solicits. Deadlines vary by RFP.",
    focus: "Solana strategic priorities",
    applyUrl:
      "https://airtable.com/apppDmK2Pin9WX8jV/shrR0uMKu4N57TGW7/tbli2ERM3sdhyHJYB",
    rolling: false,
    tags: ["solana", "rfp"],
  },
  {
    name: "Gitcoin Grants Program",
    organization: "Gitcoin",
    organizationUrl: "https://www.gitcoin.co/program",
    description:
      "Seasonal initiative combining crowdfunding and quadratic-funding matching for early-stage builders working on public goods. Quarterly rounds since 2019.",
    focus: "Public goods, OSS, ecosystem infra",
    applyUrl: "https://builder.gitcoin.co",
    rolling: false,
    tags: ["public-goods", "qf", "gitcoin"],
  },
  {
    name: "Gitcoin Community Rounds",
    organization: "Gitcoin",
    organizationUrl: "https://grants.gitcoin.co",
    description:
      "Lets ecosystems and networks run their own grant distribution rounds on the Gitcoin Grants Stack. Variable schedule.",
    focus: "Ecosystem-run rounds",
    applyUrl: "https://grants.gitcoin.co",
    rolling: false,
    tags: ["gitcoin", "qf"],
  },
  {
    name: "Octant",
    organization: "Octant",
    organizationUrl: "https://octant.app/home",
    description:
      "Public-goods funding ecosystem from Golem Foundation. Rewards stakers for participating in funding rounds for public-goods projects.",
    focus: "Public goods",
    applyUrl: "https://octant.app/home",
    rolling: false,
    tags: ["public-goods", "octant"],
  },
  {
    name: "Artizen",
    organization: "Artizen",
    organizationUrl: "https://artizen.fund/",
    description:
      "Match-funding for creators working at the intersection of art, science, technology, and culture.",
    focus: "Art, science, culture",
    applyUrl: "https://artizen.fund/",
    rolling: false,
    tags: ["art", "culture"],
  },
  {
    name: "Optimism Retro Funding",
    organization: "Optimism Collective",
    organizationUrl: "https://app.optimism.io/retropgf",
    description:
      "Retroactive public-goods funding. Rewards projects that have already delivered value to the Optimism ecosystem. Multi-round, periodic.",
    focus: "Retroactive public goods",
    applyUrl: "https://app.optimism.io/retropgf",
    rolling: false,
    tags: ["optimism", "retropgf", "public-goods"],
  },
  {
    name: "Optimism Mission Grants",
    organization: "Optimism Collective",
    organizationUrl: "https://app.optimism.io/grants",
    description:
      "Forward-looking grants for builders advancing the Optimism Collective's mission objectives. Multiple seasons per year.",
    focus: "Optimism ecosystem missions",
    applyUrl: "https://app.optimism.io/grants",
    rolling: false,
    tags: ["optimism", "missions"],
  },
  {
    name: "NEAR Foundation Grants",
    organization: "NEAR Foundation",
    organizationUrl: "https://near.foundation/grants/",
    description:
      "Funding for projects building on NEAR Protocol — chain-abstracted UX, AI/crypto, DePIN, and chain signatures use cases.",
    focus: "NEAR ecosystem",
    applyUrl: "https://near.foundation/grants/",
    rolling: true,
    tags: ["near"],
  },
  {
    name: "Aave Grants DAO",
    organization: "Aave Grants DAO",
    organizationUrl: "https://aavegrants.org/",
    description:
      "Community-led grants funding projects that benefit the Aave ecosystem — integrations, tooling, governance, education.",
    focus: "Aave ecosystem",
    applyUrl: "https://aavegrants.org/",
    rolling: true,
    tags: ["aave", "defi"],
  },
];

async function upsertGrant(payload: GrantPayload) {
  const existing = await db
    .select({ id: submissions.id, publicId: submissions.publicId })
    .from(submissions)
    .where(
      and(
        eq(submissions.type, "grant"),
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
      type: "grant",
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
  for (const g of grants) {
    const r = await upsertGrant(g);
    if (r.action === "inserted") inserted++;
    else updated++;
    console.log(`  ${r.action.padEnd(8)} /grants/${r.publicId}  ${g.name}`);
  }
  console.log(
    `\n✓ ${grants.length} grants processed (${inserted} new, ${updated} updated).`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
