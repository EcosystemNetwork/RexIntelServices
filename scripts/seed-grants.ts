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
  {
    name: "Beam Foundation Grants Program",
    organization: "Beam Foundation",
    organizationUrl: "https://grants.onbeam.com/",
    description:
      "Milestone-based funding for developers, researchers, and builders advancing the Beam ecosystem. Covers tech & infra, research, DeFi/RWA, AI & gaming protocols, plus content and community projects. Includes co-marketing, technical help, and connections to follow-on funding.",
    focus: "Beam ecosystem — infra, DeFi, RWA, AI, gaming",
    applyUrl: "https://onbeam.com/apply",
    rolling: true,
    tags: ["beam", "ecosystem", "milestone"],
  },
  {
    name: "Circle Developer Grants",
    organization: "Circle",
    organizationUrl: "https://www.circle.com/grant",
    description:
      "Milestone-based USDC grants for teams building on Arc and the Circle Developer Platform (USDC, Wallets, CCTP, Nanopayments). Priority verticals: stablecoin FX, agentic economic activity, peer-to-peer payments, treasury, prediction markets, lending/borrowing. Co-marketing and mentorship alongside the funding.",
    focus: "Stablecoin / USDC builders on Arc + Circle Developer Platform",
    applyUrl: "https://circle.questbook.app/",
    rolling: true,
    tags: ["circle", "usdc", "stablecoin", "arc", "payments"],
  },
  {
    name: "Alchemy Solana Fund",
    organization: "Alchemy",
    organizationUrl: "https://www.alchemy.com/solana-20m-fund",
    description:
      "$20M infrastructure-credit fund for Solana developers — up to $25k in Alchemy credits per team. Open to any builder on Solana, with priority access and a 15% credit bonus for participants of the Solana Foundation, Superteam (global chapters), and MonkeFoundry. Credits valid 90 days from redemption.",
    amount: "Up to $25k in credits (90-day validity); $20M total fund",
    focus: "Solana infrastructure & scaling",
    applyUrl: "https://www.alchemy.com/solana-20m-fund",
    rolling: true,
    tags: ["alchemy", "solana", "infra", "credits"],
  },
  {
    name: "Filecoin Foundation — Open Grants",
    organization: "Filecoin Foundation",
    organizationUrl: "https://fil.org/",
    description:
      "Funding for projects that advance the Filecoin network — open data, archival infrastructure, retrieval markets, and decentralized storage tooling. Rolling intake plus periodic themed rounds. Foundation-administered, separate from ProtocolLabs.",
    focus: "Decentralized storage, retrieval, public-data archives",
    applyUrl: "https://fil.org/grants",
    rolling: true,
    tags: ["filecoin", "storage", "ipfs"],
  },
  {
    name: "Stellar Community Fund",
    organization: "Stellar Development Foundation",
    organizationUrl: "https://communityfund.stellar.org/",
    description:
      "Quarterly grant rounds funding projects building on Stellar — stablecoin payments, cross-border remittances, DeFi protocols, asset issuance. Up to $150k per round across multiple awardees. Community-voted shortlist plus SDF technical review.",
    amount: "Up to $150k per round",
    focus: "Stellar applications — payments, DeFi, asset issuance",
    applyUrl: "https://communityfund.stellar.org/",
    rolling: false,
    tags: ["stellar", "payments", "stablecoin"],
  },
  {
    name: "Avalanche Foundation Grants",
    organization: "Avalanche Foundation",
    organizationUrl: "https://www.avax.network/grants",
    description:
      "Foundation-administered grants for builders on Avalanche — subnet deployments, DeFi protocols, gaming, infrastructure tooling. Multi-tier program from small dev grants through ecosystem-scale awards. Rolling intake.",
    focus: "Avalanche subnets, DeFi, gaming, infra",
    applyUrl: "https://www.avax.network/grants",
    rolling: true,
    tags: ["avalanche", "subnets", "defi", "gaming"],
  },
  {
    name: "Polkadot Treasury (OpenGov)",
    organization: "Polkadot DAO",
    organizationUrl: "https://polkadot.network/treasury",
    description:
      "DOT-denominated funding directly from the Polkadot Treasury via OpenGov referenda. Anyone can propose; passing referenda execute on-chain disbursement. Multi-million-DOT tranches available for ecosystem-scale projects; smaller bounties for specific technical work. Decentralized intake — no foundation review gate.",
    focus: "Polkadot ecosystem — parachains, infrastructure, tooling",
    applyUrl: "https://polkadot.polkassembly.io/",
    rolling: true,
    tags: ["polkadot", "opengov", "treasury", "dao"],
  },
  {
    name: "Cosmos Hub Community Pool",
    organization: "Cosmos Hub",
    organizationUrl: "https://hub.cosmos.network/",
    description:
      "ATOM-denominated grants from the Cosmos Hub community pool via governance proposals. Funds Cosmos SDK development, IBC tooling, validator infrastructure, and downstream chain integrations. Requires proposal authoring + on-chain referendum.",
    focus: "Cosmos SDK, IBC, validator infrastructure",
    applyUrl: "https://hub.cosmos.network/",
    rolling: true,
    tags: ["cosmos", "ibc", "treasury", "dao"],
  },
  {
    name: "Aptos Foundation Grants",
    organization: "Aptos Foundation",
    organizationUrl: "https://aptosfoundation.org/grants",
    description:
      "Funding for builders on Aptos — Move-language tooling, DeFi protocols, NFT/gaming infrastructure, developer experience improvements. Tiered structure across Quick Grants, Project Grants, and Ecosystem Grants. Rolling application intake.",
    focus: "Aptos ecosystem — Move, DeFi, gaming, infra",
    applyUrl: "https://aptosfoundation.org/grants",
    rolling: true,
    tags: ["aptos", "move", "defi"],
  },
  {
    name: "Sui Foundation Grants",
    organization: "Sui Foundation",
    organizationUrl: "https://sui.io/grants",
    description:
      "Multi-tier grants for projects building on Sui — Move-based DeFi, gaming, social, and infra. Includes Quick Grants (<$30k), Project Grants ($30k-$500k), and the Sui Builder House programming for accepted teams. Rolling intake.",
    focus: "Sui ecosystem — Move, gaming, DeFi, social",
    applyUrl: "https://sui.io/grants",
    rolling: true,
    tags: ["sui", "move", "gaming", "defi"],
  },
  {
    name: "Polygon Village",
    organization: "Polygon Labs",
    organizationUrl: "https://polygon.technology/polygon-village",
    description:
      "Polygon's developer-support program with milestone-based grants, credits, BD support, and access to Polygon's partner network. Covers Polygon PoS, zkEVM, and the Polygon CDK. Tiered: from technical-credit packages through ecosystem grant funding.",
    focus: "Polygon PoS / zkEVM / CDK builders",
    applyUrl: "https://polygon.technology/polygon-village",
    rolling: true,
    tags: ["polygon", "zk", "zkevm", "cdk"],
  },
  {
    name: "Starknet Foundation — Seed Grants",
    organization: "Starknet Foundation",
    organizationUrl: "https://www.starknet.io/grants",
    description:
      "STRK-denominated grants for builders on Starknet — Cairo tooling, DeFi protocols, dApps, gaming, and provable computing infrastructure. Includes a structured Seed Grant track for early-stage teams and partnerships for ecosystem-scale projects.",
    focus: "Starknet / Cairo — DeFi, gaming, provable computing",
    applyUrl: "https://www.starknet.io/grants",
    rolling: true,
    tags: ["starknet", "cairo", "zk", "stark"],
  },
  {
    name: "TON Foundation Grants",
    organization: "The Open Network Foundation",
    organizationUrl: "https://ton.org/grants",
    description:
      "Funding for projects building on TON — Telegram-native mini-apps, payments, DeFi, infrastructure tooling. Open Network Foundation administers; the TON-Telegram integration gives builders distinct distribution advantages. Rolling intake plus themed rounds.",
    focus: "TON / Telegram — mini-apps, payments, DeFi",
    applyUrl: "https://ton.org/grants",
    rolling: true,
    tags: ["ton", "telegram", "mini-apps", "payments"],
  },
  {
    name: "ENS DAO — Public Goods Working Group",
    organization: "ENS DAO",
    organizationUrl: "https://www.ensdao.org/",
    description:
      "ENS DAO funding for public-goods projects in the Ethereum ecosystem — not limited to ENS itself. Quarterly working-group rounds plus targeted ENS-utility grants for projects extending ENS infrastructure (subdomains, off-chain resolution, IPFS gateways).",
    focus: "Ethereum public goods, ENS infrastructure",
    applyUrl: "https://www.ensdao.org/",
    rolling: false,
    tags: ["ens", "ethereum", "public-goods", "dao"],
  },
  {
    name: "Scroll — Builder Grants",
    organization: "Scroll Foundation",
    organizationUrl: "https://scroll.io/builders",
    description:
      "Builder grants and infrastructure-credit support for projects deploying on Scroll, the bytecode-equivalent zkEVM L2. Tiered grants from prototyping through production deployment; includes co-marketing and gas-rebate programs for early-stage deployments.",
    focus: "Scroll / zkEVM — DeFi, infra, dApps",
    applyUrl: "https://scroll.io/builders",
    rolling: true,
    tags: ["scroll", "zk", "zkevm", "l2"],
  },
  {
    name: "Linea Ecosystem Funding",
    organization: "ConsenSys / Linea",
    organizationUrl: "https://linea.build/ecosystem-fund",
    description:
      "ConsenSys-administered grants and ecosystem funding for projects deploying on Linea, the EVM-equivalent zkEVM L2. Covers DeFi, identity, infrastructure, and consumer dApps. Rolling intake; structured Voyage / Surge programs run in parallel for user-facing campaigns.",
    focus: "Linea / zkEVM — DeFi, identity, infra",
    applyUrl: "https://linea.build/ecosystem-fund",
    rolling: true,
    tags: ["linea", "consensys", "zk", "zkevm", "l2"],
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
