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

  // === AI / robotics / safety grants (added 2026-05-17) ===
  {
    name: "Anthropic Researcher Access Program",
    organization: "Anthropic",
    organizationUrl: "https://www.anthropic.com/research/researcher-access",
    description:
      "API credits for academic and independent AI safety / interpretability researchers studying Claude. Non-dilutive — output is open research, not equity. Tracks include interpretability, evaluations, red-teaming, alignment science.",
    amount: "API credits (varies by project scope)",
    focus: "AI safety, interpretability, evaluations, alignment research",
    applyUrl: "https://www.anthropic.com/research/researcher-access",
    rolling: true,
    tags: ["anthropic", "ai-safety", "interpretability", "research", "compute-credits"],
  },
  {
    name: "OpenAI Researcher Access Program",
    organization: "OpenAI",
    organizationUrl: "https://openai.com/index/researcher-access-program/",
    description:
      "API + fine-tuning credits for academic, nonprofit, and policy researchers studying frontier models, evaluations, safety, and applied AI for public good. Application-based, no equity, output expected to be public.",
    amount: "API credits (typically tens of thousands of dollars)",
    focus: "AI research — evaluations, safety, applied policy",
    applyUrl: "https://openai.com/index/researcher-access-program/",
    rolling: true,
    tags: ["openai", "research", "evaluations", "compute-credits"],
  },
  {
    name: "Open Philanthropy — AI Safety Research Funding",
    organization: "Open Philanthropy",
    organizationUrl: "https://www.openphilanthropy.org/focus/potential-risks-advanced-ai/",
    description:
      "Open Phil's grantmaking for technical AI safety and AI governance research — career-development grants for individuals, project funding for orgs, and field-building support. One of the largest sources of non-dilutive AI safety funding globally.",
    amount: "Varies — $10k career-development to multi-$M institutional",
    focus: "AI safety, AI governance, field-building",
    applyUrl: "https://www.openphilanthropy.org/focus/potential-risks-advanced-ai/",
    rolling: true,
    tags: ["openphil", "ai-safety", "governance", "field-building"],
  },
  {
    name: "Future of Life Institute — AI Existential Safety Grants",
    organization: "Future of Life Institute",
    organizationUrl: "https://futureoflife.org/grant-program/",
    description:
      "FLI's grantmaking arm beyond the Vitalik Buterin fellowship. Annual + special grants for technical AI safety, governance, and existential-risk research. Includes named programs (Vitalik Buterin Fellowship, AI Governance Grants) and open calls.",
    amount: "Varies — $25k–$500k+",
    focus: "AI existential safety, governance, technical alignment",
    applyUrl: "https://futureoflife.org/grant-program/",
    rolling: false,
    tags: ["fli", "ai-safety", "x-risk", "governance"],
  },
  {
    name: "NSF National AI Research Institutes",
    organization: "U.S. National Science Foundation",
    organizationUrl: "https://www.nsf.gov/funding/initiatives/artificial-intelligence",
    description:
      "NSF's flagship AI research funding line. Establishes multi-year AI research institutes ($20M+ each) at U.S. universities + partner orgs covering trustworthy AI, AI-augmented learning, robotics, biology, climate. Also smaller program grants for individual PIs.",
    amount: "$20M+ per institute; smaller PI grants available",
    focus: "AI research — trustworthy AI, robotics, applied science",
    applyUrl: "https://www.nsf.gov/funding/initiatives/artificial-intelligence",
    rolling: false,
    tags: ["nsf", "ai", "robotics", "academic", "usa"],
  },
  {
    name: "ARIA — Advanced Research + Invention Agency (UK)",
    organization: "ARIA",
    organizationUrl: "https://www.aria.org.uk/",
    description:
      "UK government's high-risk / high-reward research agency. Active programmes include Safeguarded AI (provably safe AI for high-stakes deployment) and Robotics for a Climate-Resilient Future. Funds individuals, startups, and academic teams.",
    amount: "£100k–£10M+ per project",
    focus: "Frontier AI safety, robotics, deep tech",
    applyUrl: "https://www.aria.org.uk/opportunity-spaces/",
    rolling: false,
    tags: ["aria", "uk", "ai-safety", "robotics", "deep-tech"],
  },
  {
    name: "Schmidt Sciences — AI Safety Science",
    organization: "Schmidt Sciences",
    organizationUrl: "https://www.schmidtsciences.org/safety-science/",
    description:
      "Schmidt Sciences' AI Safety Science programme — funds technical research into model evaluations, interpretability, robustness, and risk assessment of frontier AI systems. Separate funding line from the AI2050 Fellows track for senior researchers.",
    amount: "$100k–$5M+ per project",
    focus: "AI safety science, evaluations, interpretability",
    applyUrl: "https://www.schmidtsciences.org/safety-science/",
    rolling: false,
    tags: ["schmidt", "ai-safety", "evaluations", "interpretability"],
  },
  {
    name: "Cohere for AI Research Grants",
    organization: "Cohere Labs",
    organizationUrl: "https://cohere.com/research",
    description:
      "Cohere Labs' open research program — compute credits + collaboration for academic and independent researchers studying multilingual NLP, retrieval, evaluations, low-resource languages. Powers research published at ACL / NeurIPS / ICLR.",
    amount: "Compute credits + research access",
    focus: "Multilingual NLP, retrieval, evaluations",
    applyUrl: "https://cohere.com/research",
    rolling: true,
    tags: ["cohere", "research", "multilingual", "nlp"],
  },

  // === Top-100 chain grants (added 2026-05-19) ===
  {
    name: "Cardano Project Catalyst",
    organization: "Cardano Foundation",
    organizationUrl: "https://projectcatalyst.io/",
    description:
      "Cardano's on-chain treasury grants engine. Community-submitted proposals across themed challenges; ada holders vote on which to fund. Funding rounds every few months — Fund15 active as of 2026. KYC + identity verification required; max two finalized proposals per applicant per round.",
    focus: "Cardano ecosystem — dApps, infra, tooling, community",
    applyUrl: "https://projectcatalyst.io/",
    rolling: false,
    tags: ["cardano", "ada", "treasury", "dao", "catalyst"],
  },
  {
    name: "BNB Chain Grants",
    organization: "BNB Chain",
    organizationUrl: "https://www.bnbchain.org/en/grants",
    description:
      "Foundation-administered grants for projects building on BNB Smart Chain, opBNB, BNB Greenfield, and the broader BNB Chain stack. Larger amounts require deeper evaluation; co-marketing + ecosystem partner intros included.",
    amount: "Up to $200K per project",
    focus: "BNB Chain ecosystem — DeFi, AI, gaming, infra",
    applyUrl: "https://www.bnbchain.org/en/grants",
    rolling: true,
    tags: ["bnb", "bsc", "opbnb", "greenfield"],
  },
  {
    name: "Hedera Foundation Grants",
    organization: "Hedera Foundation",
    organizationUrl: "https://hedera.foundation/",
    description:
      "HBAR-denominated grants for projects building on Hedera — DeFi, tokenized real-world assets, CBDCs, gaming, sustainability/carbon. Combines financial backing with technology/marketing/BD support. Transitioned from HBAR Foundation to Hedera Foundation in 2026.",
    focus: "Hedera ecosystem — DeFi, RWA, CBDCs, sustainability",
    applyUrl: "https://hedera.foundation/",
    rolling: true,
    tags: ["hedera", "hbar", "hashgraph", "rwa"],
  },
  {
    name: "Mantle Grants Program",
    organization: "Mantle",
    organizationUrl: "https://www.mantle.xyz/grants",
    description:
      "MNT-denominated grants for teams building on Mantle Network and Mantle Banking. Coordinated with Mantle EcoFund ($200M catalyzed capital pool, $300M liquidity provisioning) and the Mantle Scouts Program. Season 2 priorities: consumer, payments, AI applications, and integrations with mETH/cmETH, FBTC, aUSD, USDe.",
    amount: "Varies — MNT grants + up to $200M EcoFund follow-on",
    focus: "Mantle ecosystem — DeFi, consumer, payments, AI",
    applyUrl: "https://www.mantle.xyz/grants",
    rolling: true,
    tags: ["mantle", "mnt", "l2", "defi"],
  },
  {
    name: "Algorand xGov",
    organization: "Algorand Foundation",
    organizationUrl: "https://www.algorand.foundation/xgov-how-to-submit-grant-proposals",
    description:
      "Community-driven retroactive grants program governed by the elected xGov Council. Block proposers approve or deny incoming proposals. As of 2026, only retroactive grants for open-source contributions are accepted. Requires KYC + a one-time 100 ALGO proposer registration fee.",
    focus: "Open-source contributions to the Algorand ecosystem",
    applyUrl: "https://www.algorand.foundation/xgov-how-to-submit-grant-proposals",
    rolling: true,
    tags: ["algorand", "algo", "xgov", "retroactive", "open-source"],
  },
  {
    name: "Tezos Foundation Grants",
    organization: "Tezos Foundation",
    organizationUrl: "https://tezos.foundation/grants/",
    description:
      "Quarterly grant cycle for projects advancing the Tezos protocol — wallets, tooling, dApps, research, education. Proposals reviewed in the month after each quarter closes (Q1 submissions reviewed in April, etc.). Three-stage process: Proposal → Award → Post-Award.",
    focus: "Tezos ecosystem — protocol, tooling, research, education",
    applyUrl: "https://grants.tezos.foundation/",
    rolling: false,
    tags: ["tezos", "xtz"],
  },
  {
    name: "Flow GrantDAO + Ecosystem Fund",
    organization: "Flow Foundation",
    organizationUrl: "https://flow.com/flow-grants",
    description:
      "Two-tier funding stack: GrantDAO (community-voted, 50K+ FLOW prize pool per round) for pre-startup and post-hackathon projects, and Ecosystem Grants for startups. Backed by Flow's $725M Ecosystem Fund (a16z, Coatue, USV, DCG, Liberty City, Greenfield One). Focus on DeFi, consumer apps, and Flow-native public goods.",
    amount: "50K+ FLOW per GrantDAO round; ecosystem-scale via the $725M fund",
    focus: "Flow ecosystem — DeFi, consumer, NFT, public goods",
    applyUrl: "https://developers.flow.com/ecosystem/developer-support-hub/grants",
    rolling: true,
    tags: ["flow", "consumer", "nft"],
  },
  {
    name: "DFINITY Developer Grants",
    organization: "DFINITY Foundation",
    organizationUrl: "https://dfinity.org/grants",
    description:
      "Tiered, milestone-based grants for projects building on the Internet Computer — canister dev kits, oracles, asset bridges, dApps, tooling, integrations. 560+ grants disbursed and $10M+ awarded since the 2021 launch. Rolling intake.",
    amount: "Tiers of $5K, $25K, or $100K",
    focus: "Internet Computer — infra, dApps, tooling",
    applyUrl: "https://dfinity.org/grants",
    rolling: true,
    tags: ["icp", "internet-computer", "dfinity"],
  },
  {
    name: "Sei Creator Fund",
    organization: "Sei Foundation",
    organizationUrl: "https://blog.sei.io/creator-fund/",
    description:
      "$10M fund for new and existing NFT, social, and creative-media projects on Sei. Multi-round structure: direct foundation application in Phase 1, then community-directed quadratic funding via Gitcoin Grants Stack in Phase 2. Round #2 + Round #3 explicitly targeted creative media, IP, and developer ecosystem.",
    amount: "$10M total fund; $250K matching pool per QF round",
    focus: "Sei creators — NFT, social, IP, developer ecosystem",
    applyUrl: "https://www.sei.io/grants-and-funding",
    rolling: false,
    tags: ["sei", "nft", "social", "creators", "qf"],
  },
  {
    name: "Injective Ecosystem Fund",
    organization: "Injective Foundation",
    organizationUrl: "https://injective.com/ecosystem/",
    description:
      "$150M ecosystem fund deployed across DeFi, RWA, tokenized stocks/FX, derivatives, and interop infra built on Injective. Foundation-administered with a global virtual hackathon series ($1M+ prizes/grants per edition) running parallel to direct ecosystem allocations.",
    amount: "$150M fund + $1M+ per hackathon edition",
    focus: "Injective ecosystem — DeFi, RWA, derivatives, interop",
    applyUrl: "https://injective.com/ecosystem/",
    rolling: true,
    tags: ["injective", "inj", "defi", "rwa"],
  },
  {
    name: "dYdX Grants Program",
    organization: "dYdX Foundation",
    organizationUrl: "https://www.dydxgrants.com/",
    description:
      "Grant-making trust funding contributors who build on, benefit, or extend the dYdX v4 protocol. 2026 priorities: tooling, infrastructure, AI agents, yield-generating strategies, prediction markets, high-impact research. ~$3M USDC + 5.8M DYDX in committee capital as of Jan 2026.",
    amount: "Varies — funded from ~$3M USDC + 5.8M DYDX treasury",
    focus: "dYdX v4 — tooling, infra, AI agents, research",
    applyUrl: "https://dydxgrants.com/grants-application",
    rolling: true,
    tags: ["dydx", "derivatives", "v4", "perpetuals"],
  },
  {
    name: "Lido Ecosystem Grants Organization (LEGO)",
    organization: "Lido DAO",
    organizationUrl: "https://lido.fi/lego",
    description:
      "Lido DAO's grants arm. Funds individuals and projects that strengthen Lido liquid staking and the broader Ethereum / PoS / DeFi ecosystem. Four tiers from \"sand grains\" (small contributions) up to \"mountains\" (critical infrastructure with significant Lido impact). Process starts with a Telegram intro to the relevant LEGO member, then research.lido.fi proposal review.",
    focus: "Liquid staking, Ethereum infra, Lido tooling",
    applyUrl: "https://lido.fi/lego",
    rolling: true,
    tags: ["lido", "staking", "ethereum", "ldo"],
  },
  {
    name: "Build-a-Bera",
    organization: "Berachain Foundation",
    organizationUrl: "https://buildabera.xyz/",
    description:
      "Zero-to-one incubator + grant program for founders building on Berachain. Initial capital from the Berachain Foundation, plus mentorship from core devs, audit/design/dev resources, and access to Berachain's investor network. Designed for native projects shipping at the PoL / BGT / honey-stack layer.",
    focus: "Berachain-native — DeFi, infra, consumer",
    applyUrl: "https://buildabera.xyz/",
    rolling: true,
    tags: ["berachain", "bera", "defi"],
  },
  {
    name: "ZetaChain Ecosystem Growth Program",
    organization: "ZetaChain",
    organizationUrl: "https://www.zetachain.com/grants",
    description:
      "Foundation-administered grants funded from 5% of total ZETA supply for chain-abstraction projects and the Universal EVM. A dedicated 1% (21M ZETA) is earmarked for projects that unlock Bitcoin onto ZetaChain — BTC DeFi, lending/borrowing, DEXes, and BTC integrations into gaming/social.",
    amount: "5% of ZETA supply (ecosystem) + 1% (Bitcoin-focused)",
    focus: "Cross-chain dApps, chain abstraction, Bitcoin DeFi",
    applyUrl: "https://www.zetachain.com/grants",
    rolling: true,
    tags: ["zetachain", "zeta", "cross-chain", "bitcoin"],
  },
  {
    name: "Sonic Labs Innovator Fund",
    organization: "Sonic Foundation",
    organizationUrl: "https://www.soniclabs.com/",
    description:
      "Up to 200M FTM (~$120M at announce) committed to native application grants, strategic dApp grants, and infra/tooling builders migrating to Sonic. Complements Sonic's Fee Monetization (FeeM) revenue share that returns up to 90% of transaction fees to dApp creators.",
    amount: "Up to 200M FTM (~$120M)",
    focus: "Sonic / Fantom successor — DeFi, consumer, infra",
    applyUrl: "https://www.soniclabs.com/",
    rolling: true,
    tags: ["sonic", "fantom", "ftm", "feem"],
  },
  {
    name: "IOTA Grants",
    organization: "IOTA Ecosystem DLT Foundation",
    organizationUrl: "https://iotadlt.foundation/grants",
    description:
      "Abu Dhabi–based foundation grants for open-source IOTA / Shimmer development — tooling, libraries, wallets, frameworks, public goods, research, education, and events. Application form + interview with the IOTA Grant Committee.",
    focus: "IOTA / Shimmer — tooling, OSS, research, education",
    applyUrl: "https://iotadlt.foundation/grants",
    rolling: true,
    tags: ["iota", "shimmer", "dlt", "oss"],
  },
  {
    name: "Akash Developer Grants",
    organization: "Akash Network",
    organizationUrl: "https://akash.network/development/funding-program/",
    description:
      "Tiered AKT-denominated grants for open-source contributions to the Akash decentralized cloud — provider tooling, console improvements, deployment frameworks, pilots, content. Complemented by Akash's Community Pool (inflation + tx fees) administered via on-chain governance.",
    amount: "Tiered: $100 / $1K / $10K / up to $100K per project",
    focus: "Akash DePIN — provider tooling, deployments, OSS",
    applyUrl: "https://akash.network/development/funding-program/",
    rolling: true,
    tags: ["akash", "depin", "akt", "compute"],
  },
  {
    name: "Worldcoin Community Grants",
    organization: "Worldcoin Foundation",
    organizationUrl: "https://world.org/grants",
    description:
      "Continuous (no waves) grants program funding projects that advance the World Tech Tree and World Chain ecosystem — World ID integrations, SDKs, mini-apps, World Chain infra/research, and human-verification primitives. Rolling reviews replaced the old wave system in 2025.",
    focus: "World ID, World Chain, mini-apps, human-verification",
    applyUrl: "https://world.org/grants",
    rolling: true,
    tags: ["worldcoin", "world-chain", "wld", "proof-of-personhood"],
  },
  {
    name: "Monad Foundation Grants",
    organization: "Monad Foundation",
    organizationUrl: "https://www.monad.foundation/",
    description:
      "Foundation grants for projects shipping on Monad mainnet across High-Fidelity DeFi, payments/commerce, infra, gaming, NFTs, and identity. Up to $100K per idea, with Monad Momentum running in parallel as an incentives-matching program for breakout apps.",
    amount: "Up to $100K per idea + Momentum incentive matching",
    focus: "Monad mainnet — DeFi, payments, infra, gaming",
    applyUrl: "https://www.monad.xyz/",
    rolling: true,
    tags: ["monad", "evm", "l1"],
  },
  {
    name: "Movement Foundation Grants",
    organization: "Movement Network Foundation",
    organizationUrl: "https://www.movementnetwork.xyz/grants",
    description:
      "Grants for projects expanding the MoveVM ecosystem on Movement Network — security audits, code reviews, dev tooling, infrastructure, and apps. Open to individuals, teams, enterprises, non-profits, researchers, and educators. Runs alongside the Move Collective accelerator ($100M+ scale).",
    focus: "MoveVM on Movement — DeFi, infra, audits, tooling",
    applyUrl: "https://www.movementnetwork.xyz/grants",
    rolling: true,
    tags: ["movement", "move", "moveVM", "l2"],
  },
  {
    name: "Pyth Ecosystem Grants Program",
    organization: "Pyth Data Association",
    organizationUrl: "https://www.pyth.network/blog/pyth-ecosystem-grants-program",
    description:
      "50M PYTH committed across three categories — Community (educational content), Research (oracle improvements + adoption studies), and Developer (new tooling and use cases). Research + developer bounties run on Superteam Earn.",
    amount: "50M PYTH total across community / research / developer",
    focus: "Pyth oracle — education, research, developer tooling",
    applyUrl: "https://www.pyth.network/blog/pyth-ecosystem-grants-program",
    rolling: true,
    tags: ["pyth", "oracle", "data"],
  },
  {
    name: "Chainlink BUILD",
    organization: "Chainlink Labs",
    organizationUrl: "https://chain.link/build-program",
    description:
      "Long-term ecosystem program supporting early- and mid-stage Web3 teams with privileged Chainlink product access, dedicated technical support, infra/audit partner discounts, and co-marketing. Projects contribute native tokens claimable by Chainlink stakers + service providers in exchange.",
    focus: "Chainlink-integrated dApps — DeFi, CCIP, data, automation",
    applyUrl: "https://chain.link/build-program",
    rolling: true,
    tags: ["chainlink", "link", "oracle", "ccip"],
  },
  {
    name: "Chainlink Community Grants",
    organization: "Chainlink",
    organizationUrl: "https://chain.link/community/grants",
    description:
      "Direct funding for developers and researchers strengthening Chainlink — core tooling, data provisioning, integrations, social-impact applications. Separate from the BUILD program; non-equity, milestone-based.",
    focus: "Chainlink core — tooling, data, integrations, social impact",
    applyUrl: "https://chain.link/community/grants",
    rolling: true,
    tags: ["chainlink", "link", "tooling", "social-impact"],
  },
  {
    name: "The Graph Grants Program",
    organization: "The Graph Foundation",
    organizationUrl: "https://thegraph.com/grants/",
    description:
      "GRT-denominated grants for protocol contributions, subgraphs, Substreams, indexing tooling, dApps, and ecosystem growth. Always-open application; Wave structure used historically but intake is now continuous. Also routes via Graph AdvocatesDAO for community-focused work.",
    focus: "Indexing, subgraphs, Substreams, protocol tooling",
    applyUrl: "https://thegraph.typeform.com/applynow",
    rolling: true,
    tags: ["thegraph", "grt", "subgraphs", "substreams", "indexing"],
  },
  {
    name: "TRON Developer Grants + Ecosystem Fund",
    organization: "TRON DAO",
    organizationUrl: "https://trondao.org/ecosystem-fund/",
    description:
      "TRON DAO operates a $1B Ecosystem Fund (2021–2031, ~$100M/year allocation) plus a $90K-per-quarter Developer Grant program, $45K/quarter Influencer Grant, and $30K/quarter Community Ambassador Grant. TRON Builders League adds up to $10M follow-on. DeFi entrepreneurial alliance worth $120M runs alongside.",
    amount: "$1B ecosystem fund + ~$90K/quarter dev grants + Builders League ($10M)",
    focus: "TRON ecosystem — DeFi, stablecoins, payments, gaming",
    applyUrl: "https://trondao.org/ecosystem-fund/",
    rolling: true,
    tags: ["tron", "trx", "stablecoin"],
  },
  {
    name: "Cronos Grants",
    organization: "Cronos Labs",
    organizationUrl: "https://www.cronoslabs.org/grants",
    description:
      "Milestone-based grants for end-user applications building on Cronos EVM and Cronos zkEVM. Paid in $5K–$10K USD tranches up to $50K per project; up to $300K follow-on investment available from the $100M Cronos Labs ecosystem fund and strategic partners (Crypto.com Capital).",
    amount: "Up to $50K per project + up to $300K follow-on",
    focus: "Cronos EVM / zkEVM — consumer dApps with traction",
    applyUrl: "https://www.cronoslabs.org/grants",
    rolling: true,
    tags: ["cronos", "cro", "evm"],
  },
  {
    name: "Render Foundation Grants",
    organization: "Render Foundation",
    organizationUrl: "https://renderfoundation.com/grants",
    description:
      "Foundation grants for projects building on the Render decentralized GPU network — rendering tooling, AI/inference workloads, GPU subnet expansion, dApps. Complemented by the Render Bounty Platform (launched mid-2025) which pays out RENDER tokens for open tasks across technical tooling, documentation, research, and product feedback.",
    focus: "Render Network — GPU/DePIN, AI inference, rendering tools",
    applyUrl: "https://renderfoundation.com/grants",
    rolling: true,
    tags: ["render", "gpu", "depin", "ai", "render-token"],
  },

  // === Bitcoin L2 grants (added 2026-05-19) ===
  {
    name: "Stacks Foundation Grants Program",
    organization: "Stacks Foundation",
    organizationUrl: "https://stacks.org/grants",
    description:
      "Bitcoin L2 grants funded via SIP-031 and the Stacks Endowment. Tiered: Getting Started Grants (up to $10K for early builders), Q-cycle Ecosystem Grants for production teams, and DeGrants (community-led). Powers sBTC, Bitcoin DeFi, Clarity smart contracts, and BTC-yield infra on Stacks.",
    amount: "Tiered — up to $10K Getting Started; larger Endowment grants",
    focus: "Bitcoin L2 — sBTC, BTC DeFi, Clarity smart contracts",
    applyUrl: "https://stacks.org/grants",
    rolling: true,
    tags: ["stacks", "stx", "bitcoin-l2", "sbtc", "clarity"],
  },
  {
    name: "Stacks Ascent",
    organization: "Stacks Foundation",
    organizationUrl: "https://stacks.org/ascent",
    description:
      "Founder-track program with structured milestones to go from code to company on Stacks. $7K starter grants, personalized code feedback, networking and follow-on access. Designed for solo builders and small teams pre-fundraise.",
    amount: "$7K starter grants + ongoing milestone unlocks",
    focus: "Stacks founder track — pre-fundraise Bitcoin builders",
    applyUrl: "https://stacks.org/ascent",
    rolling: true,
    tags: ["stacks", "stx", "bitcoin-l2", "ascent", "founder-track"],
  },
  {
    name: "Rootstock Strategic Grants",
    organization: "RootstockLabs",
    organizationUrl: "https://rootstock.io/integrate/",
    description:
      "$2.5M Strategic Grant program for projects integrating with Rootstock — the longest-running Bitcoin sidechain. Priority on interoperability, DeFi protocols, infra/bridges, and tooling that expands rBTC and the RIF stack. 27+ projects funded across prior waves.",
    amount: "$2.5M total program",
    focus: "Rootstock / RSK — Bitcoin sidechain DeFi + interoperability",
    applyUrl: "https://rootstock.io/integrate/",
    rolling: true,
    tags: ["rootstock", "rsk", "rbtc", "bitcoin-sidechain"],
  },
  {
    name: "RootstockCollective Grants",
    organization: "RootstockCollective DAO",
    organizationUrl: "https://rootstockcollective.com/",
    description:
      "Decentralized grants program governed by the RootstockCollective DAO. RIF stakers vote on funded proposals and earn BTC rewards via the DAO's reward stream. Funds next-gen Bitcoin builders across the Rootstock ecosystem.",
    focus: "Rootstock community — DAO-funded Bitcoin builders",
    applyUrl: "https://rootstockcollective.com/",
    rolling: true,
    tags: ["rootstock", "rif", "dao", "bitcoin-l2"],
  },
  {
    name: "Citrea Origins",
    organization: "Citrea Foundation",
    organizationUrl: "https://citrea.xyz/",
    description:
      "Ecosystem grants from the Citrea Foundation Treasury for native applications on Citrea — Bitcoin's first ZK rollup secured by BitVM via Clementine. Targets ctUSD stablecoin integrations, native BTC lending, and BitVM-aware infra. Mainnet launched January 2026.",
    focus: "Citrea — Bitcoin ZK rollup native dApps + BitVM infra",
    applyUrl: "https://citrea.xyz/",
    rolling: true,
    tags: ["citrea", "ctr", "bitcoin-l2", "zk", "bitvm", "btc"],
  },
  {
    name: "Mezo Founder Program",
    organization: "Mezo / Thesis / Supernormal Foundation",
    organizationUrl: "https://mezo.org/ecosystem",
    description:
      "Bitcoin L2 founder grants from Mezo (Thesis's BTC-collateral chain). Funding, technical, and go-to-market support for production-ready dApps deploying on Mezo and integrating MUSD. >$3M deployed across prior cycles backed by Draper Associates, Boost VC, and Draper Dragon. A Grant Committee + voting delegation rolls out alongside the 2026 roadmap.",
    amount: "Varies; >$3M deployed across prior cycles",
    focus: "Mezo Bitcoin L2 — BTC lending, MUSD-integrated dApps",
    applyUrl: "https://mezo.org/ecosystem",
    rolling: true,
    tags: ["mezo", "bitcoin-l2", "btc", "musd", "thesis"],
  },
  {
    name: "Bitlayer Ready Player One",
    organization: "Bitlayer",
    organizationUrl: "https://www.bitlayer.org/",
    description:
      "Bitlayer's $50M+ booster grant program for projects deploying on the BitVM-based Bitcoin L2. New builders: $10K–$30K. Experienced builders: $30K–$300K. Special sponsorships up to $1M for user-growth events. Awards tied to mainnet performance metrics.",
    amount: "$10K–$300K standard; up to $1M for special sponsorships",
    focus: "Bitlayer / BitVM — Bitcoin DeFi, infra, consumer",
    applyUrl: "https://www.bitlayer.org/",
    rolling: true,
    tags: ["bitlayer", "bitvm", "bitcoin-l2", "btc"],
  },
  {
    name: "Babylon Foundation Ecosystem Grants",
    organization: "Babylon Foundation",
    organizationUrl: "https://babylonlabs.io/",
    description:
      "BABY-denominated grants for BTCfi projects on Babylon — Bitcoin staking, BTC-collateral primitives, and apps consuming the largest Bitcoin staking pool (56,853+ BTC TVL as of 2026). Foundation allocates a portion of the ~6.9B BABY ecosystem reserve to grants and developer rewards alongside staking incentives.",
    focus: "Babylon BTCfi — Bitcoin staking, BTC collateral, restaking",
    applyUrl: "https://babylonlabs.io/",
    rolling: true,
    tags: ["babylon", "baby", "bitcoin-staking", "btcfi", "restaking"],
  },
  {
    name: "B² Network Ecosystem Grants",
    organization: "B² Network",
    organizationUrl: "https://www.bsquared.network/",
    description:
      "B² token–funded ecosystem incentives for builders deploying on B² Network's modular Bitcoin L2 (zk-proof rollup, EVM-compatible). Covers developer grants, hackathons, liquidity-mining programs, and community rewards. Use cases skew toward RWA tokenization and AI-driven yield models.",
    focus: "B² Network — Bitcoin L2 dApps, RWA, AI yield",
    applyUrl: "https://www.bsquared.network/",
    rolling: true,
    tags: ["b2network", "bitcoin-l2", "btc", "zk", "evm"],
  },
  {
    name: "BOB Foundation Grants",
    organization: "BOB Foundation (Build on Bitcoin)",
    organizationUrl: "https://www.gobob.xyz/",
    description:
      "BOB Foundation grants for developers building on the Bank-of-Bitcoin hybrid L2 — BTC swaps, savings, lending, and BitVM-aware DeFi primitives via the BOB SDK. 46.9% of BOB supply is allocated to Ecosystem & Community, of which a portion funds builder activations and the 2026 \"Gateway to Bitcoin DeFi\" initiative connecting BOB to 100+ chains.",
    focus: "BOB hybrid L2 — Bitcoin DeFi, BTC swap/lend, BitVM",
    applyUrl: "https://www.gobob.xyz/ecosystem",
    rolling: true,
    tags: ["bob", "bitcoin-l2", "btc", "hybrid-l2", "btcfi"],
  },

  // === Bitcoin pure-protocol / freedom-tech grants (added 2026-05-19) ===
  {
    name: "OpenSats",
    organization: "OpenSats",
    organizationUrl: "https://opensats.org/",
    description:
      "Nonprofit funding the largest Bitcoin + Nostr open-source pipeline anywhere — $1M/month deployed to hundreds of grantees in 40+ countries. Two tracks: General Grants and Long-Term Support (LTS) for sustained contributors. Nym-friendly application — pseudonymous devs welcome.",
    amount: "$1M/month total; varies per grantee",
    focus: "Bitcoin Core, Lightning, Nostr, freedom tech",
    applyUrl: "https://opensats.org/apply",
    rolling: true,
    tags: ["opensats", "bitcoin", "nostr", "lightning", "freedom-tech", "oss"],
  },
  {
    name: "Brink Bitcoin Grants",
    organization: "Brink",
    organizationUrl: "https://brink.dev/programs",
    description:
      "Year-long grants for established Bitcoin protocol developers to work full-time on Bitcoin Core and Lightning. Funded with $5M over 5 years from Jack Dorsey's #startsmall ($1M/year run-rate). Companion Fellowship Program mentors first-time contributors. Eligibility: track record of high-quality, security-first Bitcoin contributions.",
    amount: "Year-long grants (full-time stipend)",
    focus: "Bitcoin Core, Lightning, base-protocol security",
    applyUrl: "https://brink.homerun.co/grants",
    rolling: true,
    tags: ["brink", "bitcoin-core", "lightning", "protocol-dev", "oss"],
  },
  {
    name: "Spiral",
    organization: "Spiral (Block, Inc.)",
    organizationUrl: "https://spiral.xyz/",
    description:
      "Block's bitcoin FOSS arm. Funds 24+ Bitcoin developers and designers in 18+ countries — the largest direct Bitcoin grant pool of its kind. Backs Bitcoin Core, Bitcoin Dev Kit (BDK), Lightning Dev Kit (LDK), and UX/privacy/scalability tooling. Also funds Bitcoin Design Foundation design grants.",
    focus: "Bitcoin Core, BDK, LDK, UX + privacy",
    applyUrl: "https://spiral.xyz/",
    rolling: true,
    tags: ["spiral", "block", "bitcoin-core", "bdk", "ldk", "oss"],
  },
  {
    name: "Btrust Developer Grants",
    organization: "Btrust",
    organizationUrl: "https://www.btrust.tech/grants",
    description:
      "Bitcoin developer grants targeted at Africa, India, Latin America, MENA, Southeast Asia, and the broader Global South (case-by-case for elsewhere). Founded by Jack Dorsey + Jay-Z with 500 BTC endowment. Three tracks: Starter Grants, Open-Source Cohort (long-term), and event/educator grants. Q1 2026 cohort included Cashu development and a dedicated research proposal.",
    focus: "Bitcoin Global South — protocol, L2, education, events",
    applyUrl: "https://www.btrust.tech/grants",
    rolling: true,
    tags: ["btrust", "bitcoin", "global-south", "protocol-dev"],
  },
  {
    name: "HRF Bitcoin Development Fund",
    organization: "Human Rights Foundation",
    organizationUrl: "https://hrf.org/program/financial-freedom/bitcoin-development-fund/",
    description:
      "Human Rights Foundation fund providing uncensorable-money grants to Bitcoin OSS, research, education, and projects serving the 6.2B people under authoritarian regimes. Rolling intake; recipients announced at end of each quarter. April 2026 round disbursed 1.5B sats across privacy, education, and OSS projects.",
    amount: "Varies — denominated in BTC/satoshis",
    focus: "Bitcoin privacy, OSS, education in authoritarian regimes",
    applyUrl: "https://hrf.org/program/financial-freedom/bitcoin-development-fund/",
    rolling: true,
    tags: ["hrf", "bitcoin", "privacy", "human-rights", "freedom-tech"],
  },

  // === More chain / protocol grants (added 2026-05-19) ===
  {
    name: "Eigen Foundation Community Grants",
    organization: "Eigen Foundation",
    organizationUrl: "https://docs.eigenfoundation.org/category/grants",
    description:
      "40M EIGEN spending cap across two tracks: Open Innovation Grants (early-stage AVSs, experimental restaking primitives, ecosystem onboarding) and Strategic Grants (high-caliber teams driving long-term EIGEN/EigenDA adoption). Allocated in 6-month Seasons reviewed by the Grants Oversight Council.",
    amount: "Up to 40M EIGEN total program",
    focus: "EigenLayer / EigenDA — AVSs, restaking, token-related infra",
    applyUrl: "https://docs.eigenfoundation.org/grants/overview",
    rolling: true,
    tags: ["eigenlayer", "eigen", "restaking", "avs", "eigenda"],
  },
  {
    name: "Story Foundation Ecosystem Grants",
    organization: "Story Foundation",
    organizationUrl: "https://www.story.foundation/ecosystem",
    description:
      "Ecosystem grants from the Story Foundation's allocation (38.4% of $IP supply earmarked for Ecosystem & Community). Targets developers, creators, and community programs that turn IP into programmable, on-chain assets — ownership, remix, monetization rails for the $61T IP asset class.",
    focus: "Story Protocol — programmable IP, creator tooling, AI training data",
    applyUrl: "https://www.story.foundation/ecosystem",
    rolling: true,
    tags: ["story", "ip", "creators", "ai-training"],
  },
  {
    name: "LayerZero Foundation Grants",
    organization: "LayerZero Foundation",
    organizationUrl: "https://layerzero.foundation/",
    description:
      "Foundation-administered grants funded from the 14.5% of ZRO supply under LayerZero Foundation control (5% unlocked at launch for ecosystem growth + grants + liquidity provisioning). Additional 15.3% reserved for future RFPs and snapshot-based distributions to infra builders, protocols, and community contributors.",
    amount: "Drawn from 5% of ZRO supply unlocked at launch",
    focus: "LayerZero / Omnichain — cross-chain protocols, OFTs, infra",
    applyUrl: "https://layerzero.network/ecosystem",
    rolling: true,
    tags: ["layerzero", "zro", "cross-chain", "omnichain"],
  },
  {
    name: "Wormhole xGrant Program",
    organization: "Wormhole Foundation",
    organizationUrl: "https://wormhole.com/ecosystem/ecosystem-programs",
    description:
      "Software-development + research grants for multichain protocols and use cases on Wormhole. Open to any stage; covers dev costs, marketing, and team expenses. Requires open-source code + clear Wormhole ecosystem benefit. Applications via the wormhole-foundation/grants GitHub repo or Superteam Earn.",
    focus: "Wormhole multichain — cross-chain protocols, infra, research",
    applyUrl: "https://wormhole.com/wormhole-xgrant-application",
    rolling: true,
    tags: ["wormhole", "w", "cross-chain", "multichain"],
  },
  {
    name: "Wormhole Sigma Startup Program",
    organization: "Wormhole Foundation",
    organizationUrl: "https://wormhole.com/ecosystem/ecosystem-programs",
    description:
      "Wormhole's startup-track program with customized grants for high-asymmetry teams and projects building multichain-native applications. Distinct from xGrant — designed for high-potential founders rather than open-ended OSS contributions.",
    focus: "Wormhole-native startups — high-asymmetry multichain dApps",
    applyUrl: "https://wormhole.com/ecosystem/ecosystem-programs",
    rolling: true,
    tags: ["wormhole", "startup", "multichain"],
  },
  {
    name: "LUKSO Grants Program",
    organization: "Foundation for the New Creative Economies (FNCΞ)",
    organizationUrl: "https://lukso.network/developer-grants",
    description:
      "LYX-denominated grants for social, cultural, and creative dApps on LUKSO — Universal Profiles, LSP integrations, The Grid mini-dApps. Wave 1 deployed $1M USD across 23 projects. Wave 2 \"Hack The Grid\" runs in partnership with Gitcoin: $150K in LYX for mini-dApp builders. Milestone-based payouts.",
    amount: "Wave 1: $1M USD total; Wave 2: $150K LYX",
    focus: "LUKSO — Universal Profiles, social/creator dApps, The Grid",
    applyUrl: "https://apply.grants.fnce.foundation/en",
    rolling: false,
    tags: ["lukso", "lyx", "creator", "social", "the-grid"],
  },
  {
    name: "Manta Foundation EcoFund",
    organization: "Manta Foundation",
    organizationUrl: "https://foundation.manta.network/grant-program",
    description:
      "$50M ecosystem fund split across direct investments ($35M), early-stage grants ($10M), AI/DePIN/ZK/memecoin verticals ($2M), hackathons ($5M), and general grants ($4M). Powers Manta Pacific (post-Aug 2026 Polkadot parachain sunset). Rolling intake, ~2-week initial screening by Manta + VC + community committee.",
    amount: "$50M total fund; up to $10M earmarked for early-stage grants",
    focus: "Manta Pacific — ZK applications, AI/DePIN, frictionless onboarding",
    applyUrl: "https://foundation.manta.network/grant-program",
    rolling: true,
    tags: ["manta", "zk", "depin", "manta-pacific"],
  },
  {
    name: "ApeCo Grants",
    organization: "ApeCo (ApeCoin Foundation successor)",
    organizationUrl: "https://apecoin.com/governance",
    description:
      "Grant framework managed by ApeCo, the new entity that took over the ApeCoin DAO's $168M treasury after the Q1 2026 governance overhaul (99.6% approval). Funds projects strengthening ApeChain, Bored Ape Yacht Club, and Otherside. Competitive intake; execution-focused.",
    focus: "ApeChain ecosystem — gaming, metaverse, BAYC IP",
    applyUrl: "https://apecoin.com/governance",
    rolling: true,
    tags: ["apechain", "ape", "apecoin", "bayc", "otherside"],
  },
  {
    name: "Aleph Zero Ecosystem Funding Program",
    organization: "Aleph Zero Foundation",
    organizationUrl: "https://alephzero.org/ecosystem-funding-program",
    description:
      "$50M pool of grants + follow-on funding. Tiered: $10K–$50K (tooling/research/education), up to $150K (regular ecosystem work, larger conferences), up to $500K (high-visibility flagship projects). Priority: privacy + compliance use cases integrating ZkOS. Bundled benefits include $100K AWS Activate credits + Kudelski audit support. ~3-week review.",
    amount: "$10K – $500K per project; $50M total",
    focus: "Aleph Zero — privacy, compliance, ZkOS integrations",
    applyUrl: "https://alephzero.org/ecosystem-funding-program",
    rolling: true,
    tags: ["aleph-zero", "azero", "privacy", "zk", "zkos"],
  },
  {
    name: "Helium Foundation Grants",
    organization: "Helium Foundation",
    organizationUrl: "https://www.helium.foundation/grants",
    description:
      "$50M grant program for decentralized wireless / DePIN builders — IoT, Helium Mobile (Solana-based), coverage expansion, dev tooling, and community education. 2026 priorities: decentralization, ecosystem collaboration, and accelerating market adoption (NYC + US/Mexico rollout with Movistar partnership).",
    amount: "$50M total program",
    focus: "Helium DePIN — wireless coverage, IoT, mobile, dev tooling",
    applyUrl: "https://www.helium.foundation/grants",
    rolling: true,
    tags: ["helium", "hnt", "depin", "wireless", "iot", "solana"],
  },
  {
    name: "Base Builder Grants",
    organization: "Coinbase (Base)",
    organizationUrl: "https://www.base.org/build",
    description:
      "Retroactive ETH-denominated grants for builders who have already shipped on Base. Typical award: 1–5 ETH per recipient; ~300 ETH paid out to date. Complemented by Onchain Summer II (Jun–Aug 2026, 600+ ETH / ~$2M in prizes/grants/credits) and ongoing /base-builds rounds (5 ETH reward pools) for builders posting progress on Warpcast.",
    amount: "1–5 ETH per recipient; 600+ ETH across Onchain Summer II",
    focus: "Base ecosystem — consumer onchain apps, Smart Wallet, AgentKit",
    applyUrl: "https://www.base.org/build",
    rolling: true,
    tags: ["base", "coinbase", "eth", "retroactive", "onchain-summer"],
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
