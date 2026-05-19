/**
 * Run with: npx tsx scripts/seed-perks.ts
 *
 * Seeds /intel?lane=perks — vendor + infra perks programs: credits,
 * cloud allocations, builder discounts. Distinct from grants
 * (non-dilutive cash) and capital (equity) — the value is in-kind:
 * credits, free tier extensions, services.
 *
 * Curation rule: real programs from named vendors with a public
 * application or signup. Skip "talk to sales" pages dressed up as
 * perks — that's a sales funnel, not a perk.
 *
 * Idempotent: matched by payload->>'name'.
 */
import "dotenv/config";
import { and, eq, sql } from "drizzle-orm";
import { db, submissions } from "../src/lib/db";
import type { PerksPayload } from "../src/lib/db/schema";

const perks: PerksPayload[] = [
  {
    name: "Alchemy Solana $20M Fund",
    organization: "Alchemy",
    organizationUrl: "https://www.alchemy.com/solana-20m-fund",
    description:
      "$20M credits program for Solana builders, run by Alchemy in partnership with Superteam, the Solana Foundation, and Monke Foundry. Teams can claim up to $25k in Alchemy credits to evaluate the infrastructure over a 90-day window. No lock-in, no proprietary APIs, and responses arrive within five business days of application. Aimed at teams shipping on Solana — early-stage, scaling, or already in production.",
    value: "Up to $25k in credits",
    category: "Infra · RPC",
    ecosystem: "Solana",
    eligibility:
      "Teams building on Solana. Application asks for project website, contact info, and current infrastructure provider.",
    applyUrl: "https://www.alchemy.com/solana-20m-fund",
    rolling: true,
    tags: ["solana", "credits", "rpc", "infra"],
  },
  {
    name: "AWS Activate",
    organization: "Amazon Web Services",
    organizationUrl: "https://aws.amazon.com/activate/",
    description:
      "AWS's startup program — credits, technical support, business resources, and AWS support plan credits for eligible startups. Two main tiers: Founders ($1k credits, self-service) and Portfolio (up to $100k credits, by invitation from a participating accelerator / VC / incubator). Includes 2 years of AWS Business Support credits, training credits, and 1:1 architecture sessions on the higher tier.",
    value: "$1k–$100k AWS credits + Business Support",
    category: "Cloud · Credits",
    ecosystem: "Any",
    eligibility: "Pre-Series B, founded <10 years ago, <$100M funding. Portfolio tier requires intro from a participating org.",
    applyUrl: "https://aws.amazon.com/activate/",
    rolling: true,
    tags: ["aws", "cloud", "credits", "any-stage"],
  },
  {
    name: "Google for Startups Cloud Program",
    organization: "Google Cloud",
    organizationUrl: "https://cloud.google.com/startup",
    description:
      "Google Cloud's startup program. Up to $200k in Google Cloud credits (two-year window) for eligible early-stage startups; up to $350k for AI-first startups in the Google Cloud + AI track. Includes free technical training, 1:1 mentorship sessions, and unlimited Google Workspace Business Plus for the first year. Application requires startup stage and existing investor.",
    value: "Up to $200k credits (up to $350k for AI)",
    category: "Cloud · Credits",
    ecosystem: "Any",
    eligibility: "Pre-Series A typically; AI track requires AI-first thesis. Open to most early-stage funded startups.",
    applyUrl: "https://cloud.google.com/startup",
    rolling: true,
    tags: ["gcp", "cloud", "credits", "ai"],
  },
  {
    name: "Microsoft for Startups Founders Hub",
    organization: "Microsoft",
    organizationUrl: "https://www.microsoft.com/en-us/startups",
    description:
      "Microsoft's startup credits program. Up to $150k in Azure credits, free GitHub Enterprise, Microsoft 365, and Visual Studio subscriptions. Also includes $2,500 in OpenAI API credits via Azure OpenAI Service plus 1:1 mentorship from Microsoft engineers. Self-service application with no equity, no VC intro required.",
    value: "Up to $150k Azure credits + GitHub + M365",
    category: "Cloud · Credits",
    ecosystem: "Any",
    eligibility: "Any pre-Series C startup, no intro or check required. Self-attested founder status.",
    applyUrl: "https://www.microsoft.com/en-us/startups",
    rolling: true,
    tags: ["azure", "github", "openai", "credits", "no-equity"],
  },
  {
    name: "Notion for Startups",
    organization: "Notion",
    organizationUrl: "https://www.notion.com/startups",
    description:
      "Free Notion Plus for up to 6 months ($1,000+ value depending on team size) for new startups. Plus free Notion AI for 6 months. Application is fast — typically approved within 24 hours given a valid investor/accelerator partner code or self-attested seed-stage status.",
    value: "Free Notion Plus + AI for 6 months",
    category: "Productivity · SaaS",
    ecosystem: "Any",
    eligibility: "Pre-Series A startups <2 years old; accelerator-affiliated teams pre-approved.",
    applyUrl: "https://www.notion.com/startups",
    rolling: true,
    tags: ["notion", "productivity", "saas", "credits"],
  },
  {
    name: "Linear for Startups",
    organization: "Linear",
    organizationUrl: "https://linear.app/method/startup-program",
    description:
      "Linear's startup program — 50% off Linear Plus for the first year for eligible startups. Targeting teams of <50 building a software product. Partnered with major accelerators (YC, Antler, Techstars, Sequoia Arc) for direct enrollment.",
    value: "50% off Linear Plus for 1 year",
    category: "Productivity · SaaS",
    ecosystem: "Any",
    eligibility: "Software startups <50 people. Accelerator-affiliated teams enrolled automatically.",
    applyUrl: "https://linear.app/method/startup-program",
    rolling: true,
    tags: ["linear", "productivity", "saas"],
  },
  {
    name: "Vercel for Startups",
    organization: "Vercel",
    organizationUrl: "https://vercel.com/startups",
    description:
      "Up to $25k in Vercel credits for early-stage startups — Pro tier, Vercel functions, edge config, and v0 AI generation credits included. Aimed at teams shipping web apps on Next.js, SvelteKit, Nuxt, etc. Standard application, accelerator-affiliated teams pre-approved.",
    value: "Up to $25k Vercel credits",
    category: "Cloud · Hosting",
    ecosystem: "Any",
    eligibility: "Pre-Series A startups; accelerator partners pre-approved.",
    applyUrl: "https://vercel.com/startups",
    rolling: true,
    tags: ["vercel", "nextjs", "hosting", "credits"],
  },
  {
    name: "MongoDB Atlas for Startups",
    organization: "MongoDB",
    organizationUrl: "https://www.mongodb.com/solutions/startups",
    description:
      "Up to $5k in MongoDB Atlas credits, free training credits via MongoDB University, and 1:1 architecture review sessions. Aimed at teams building on MongoDB Atlas or considering it. Standard self-service application.",
    value: "Up to $5k Atlas credits + training",
    category: "Infra · Database",
    ecosystem: "Any",
    eligibility: "Pre-Series B startups <5 years old.",
    applyUrl: "https://www.mongodb.com/solutions/startups",
    rolling: true,
    tags: ["mongodb", "database", "credits"],
  },
  {
    name: "Stripe Atlas",
    organization: "Stripe",
    organizationUrl: "https://stripe.com/atlas",
    description:
      "Delaware C-corp incorporation and US business setup for global founders, run by Stripe. $500 one-time fee covers state filing, EIN application, founder-stock issuance, 83(b) elections, and connected Stripe / banking accounts. Includes ongoing legal and tax discounts via partner network. The default path for non-US founders incorporating to raise from US capital.",
    value: "$500 Delaware C-corp setup + partner discounts",
    category: "Legal · Incorporation",
    ecosystem: "Any",
    eligibility: "Any global founder wanting a US C-corp. No funding stage required.",
    applyUrl: "https://stripe.com/atlas",
    rolling: true,
    tags: ["stripe", "legal", "incorporation", "global"],
  },
  {
    name: "Mercury Raise",
    organization: "Mercury",
    organizationUrl: "https://mercury.com/raise",
    description:
      "Mercury's free banking + program for founders raising venture rounds. Free Mercury banking, plus the Raise platform (curated VC introductions, investor-update tooling, founder community). Mercury Treasury earns yield on idle funds. Banking is free for any startup; the Raise community has a separate application gate.",
    value: "Free banking + curated VC intros via Raise",
    category: "Banking · Finance",
    ecosystem: "Any",
    eligibility: "Any US-incorporated startup; Raise community gated for active fundraisers.",
    applyUrl: "https://mercury.com/raise",
    rolling: true,
    tags: ["mercury", "banking", "fundraising"],
  },
  {
    name: "HubSpot for Startups",
    organization: "HubSpot",
    organizationUrl: "https://www.hubspot.com/startups",
    description:
      "Up to 90% off HubSpot's Marketing, Sales, and Service Hubs for year 1, 50% off year 2, 25% off year 3. Includes onboarding and partner enablement. Requires intro from a HubSpot-partnered VC, accelerator, or incubator (extensive list including most major US programs).",
    value: "90% off year 1 (down to 25% by year 3)",
    category: "CRM · Marketing",
    ecosystem: "Any",
    eligibility: "Pre-Series A, intro from a HubSpot-partner accelerator / VC / incubator required.",
    applyUrl: "https://www.hubspot.com/startups",
    rolling: true,
    tags: ["hubspot", "crm", "marketing"],
  },
  {
    name: "Atlassian for Startups",
    organization: "Atlassian",
    organizationUrl: "https://www.atlassian.com/software/startups",
    description:
      "Free Jira, Confluence, Bitbucket, and Compass for early-stage startups (free tiers extended to up to 50 users). Plus 50% off paid plans for the first year. Self-service application; most startups are auto-approved.",
    value: "Free Jira/Confluence/Bitbucket up to 50 users; 50% off paid",
    category: "Productivity · DevTools",
    ecosystem: "Any",
    eligibility: "Pre-Series A startups <10 employees.",
    applyUrl: "https://www.atlassian.com/software/startups",
    rolling: true,
    tags: ["atlassian", "jira", "confluence", "devtools"],
  },
  {
    name: "QuickNode Startup Program",
    organization: "QuickNode",
    organizationUrl: "https://www.quicknode.com/startup-program",
    description:
      "Up to $25k in QuickNode credits for Web3 startups — RPC endpoints, WebSockets, archive nodes, and QuickAlerts across 35+ chains. Includes 1:1 onboarding and access to QuickNode's solutions team. Application requires brief project description and ecosystem tags.",
    value: "Up to $25k QuickNode credits",
    category: "Infra · RPC",
    ecosystem: "Multi-chain",
    eligibility: "Pre-Series A Web3 startups across EVM, Solana, Bitcoin, and 35+ supported chains.",
    applyUrl: "https://www.quicknode.com/startup-program",
    rolling: true,
    tags: ["quicknode", "rpc", "infra", "multi-chain"],
  },
  {
    name: "Helius Startup Program",
    organization: "Helius Labs",
    organizationUrl: "https://www.helius.dev/",
    description:
      "Helius (Solana-focused RPC + dev infra) offers credits and reduced-rate access to its production endpoints for Solana startups. Includes the DAS API, geyser streams, and webhook infrastructure. Apply via the Helius site contact / sales channel — fast turnaround for in-thesis Solana teams.",
    value: "Discounted credits + production endpoints",
    category: "Infra · RPC",
    ecosystem: "Solana",
    eligibility: "Solana-native startups, all stages.",
    applyUrl: "https://www.helius.dev/",
    rolling: true,
    tags: ["helius", "solana", "rpc", "infra"],
  },
  {
    name: "OpenAI for Startups",
    organization: "OpenAI",
    organizationUrl: "https://openai.com/forstartups/",
    description:
      "OpenAI's startup credits program — API credits for GPT-class models, structured 1:1 engineering support, and access to early-access feature previews (new model releases, fine-tuning, voice, etc.). Eligibility requires affiliation with a partner accelerator, VC, or incubator (extensive list — most major US/EU programs are partnered).",
    value: "Tiered API credits + early-access previews",
    category: "AI · API Credits",
    ecosystem: "Any",
    eligibility: "Pre-Series B startups via a partner accelerator / VC / incubator.",
    applyUrl: "https://openai.com/forstartups/",
    rolling: true,
    tags: ["openai", "ai", "api", "credits"],
  },
  {
    name: "Anthropic for Startups",
    organization: "Anthropic",
    organizationUrl: "https://www.anthropic.com/startups",
    description:
      "Anthropic's startup credits program. Up to $5k in Claude API credits, technical office hours with Anthropic engineers, and priority access to model previews and new features. Self-service application; partner-affiliated startups via Y Combinator, Sequoia, Lightspeed, Menlo, and others are pre-approved.",
    value: "Up to $5k Claude API credits + office hours",
    category: "AI · API Credits",
    ecosystem: "Any",
    eligibility: "Pre-Series A startups <2 years old. Partner-affiliated teams auto-approved.",
    applyUrl: "https://www.anthropic.com/startups",
    rolling: true,
    tags: ["anthropic", "claude", "ai", "credits"],
  },
  {
    name: "Brex for Startups",
    organization: "Brex",
    organizationUrl: "https://www.brex.com/startups",
    description:
      "Free Brex banking + corporate card for startups. Includes Brex Cash (high-yield account), expense management, and the Brex Travel platform. No personal guarantee required; underwriting based on company funding. Partnered with most major accelerators (YC, Techstars, 500 Global, etc.) for instant approval.",
    value: "Free banking + corporate card + treasury",
    category: "Banking · Finance",
    ecosystem: "Any",
    eligibility: "US-incorporated startups with $50k+ in bank deposits, or accelerator-affiliated.",
    applyUrl: "https://www.brex.com/startups",
    rolling: true,
    tags: ["brex", "banking", "card", "fintech"],
  },
  {
    name: "Ramp for Startups",
    organization: "Ramp",
    organizationUrl: "https://ramp.com/startups",
    description:
      "Ramp's startup tier — free corporate cards, expense management, vendor management, and bill-pay infrastructure. 1.5% unlimited cashback on all card spend. Partner discounts on 1,000+ SaaS vendors (often 10-50% off) including AWS, Slack, Notion, and more. Free tier indefinitely; no monthly fees.",
    value: "Free cards + expense mgmt + 1.5% cashback + vendor discounts",
    category: "Spend Mgmt · Finance",
    ecosystem: "Any",
    eligibility: "Any US-incorporated business; partner-affiliated startups expedited.",
    applyUrl: "https://ramp.com/startups",
    rolling: true,
    tags: ["ramp", "spend-mgmt", "fintech", "cashback"],
  },
  {
    name: "Carta Startup Plan",
    organization: "Carta",
    organizationUrl: "https://carta.com/startups/",
    description:
      "Free cap-table management for startups under 25 stakeholders — equity issuance, 409A valuations, stock-option grants, and SAFE-note tracking. Tiered upgrade for larger rounds. Standard tool of record for US venture-backed startups.",
    value: "Free cap-table for <25 stakeholders",
    category: "Legal · Equity",
    ecosystem: "Any",
    eligibility: "US-incorporated startups (Delaware C-corp typical).",
    applyUrl: "https://carta.com/startups/",
    rolling: true,
    tags: ["carta", "cap-table", "equity", "legal"],
  },
  {
    name: "Deel for Startups",
    organization: "Deel",
    organizationUrl: "https://www.deel.com/startups/",
    description:
      "Free Deel HR for the first 100 employees + 50% off Deel's global payroll / EOR services for the first year. Lets startups hire globally without setting up entities in each country. Partnered with most major accelerators (YC, Antler, Techstars) for pre-approved enrollment.",
    value: "Free HR for 100 employees + 50% off EOR year 1",
    category: "HR · Payroll",
    ecosystem: "Any",
    eligibility: "Pre-Series B startups hiring globally.",
    applyUrl: "https://www.deel.com/startups/",
    rolling: true,
    tags: ["deel", "hr", "payroll", "global-hiring"],
  },
  {
    name: "Datadog for Startups",
    organization: "Datadog",
    organizationUrl: "https://www.datadoghq.com/startup/",
    description:
      "$10k in Datadog credits + free Pro tier access for one year for eligible startups. Covers infrastructure monitoring, APM, log management, RUM, and synthetics. Requires intro from a partner accelerator, VC, or incubator for accelerated approval.",
    value: "$10k Datadog credits + free Pro for 1 year",
    category: "Observability · Monitoring",
    ecosystem: "Any",
    eligibility: "Pre-Series B startups via partner-affiliated program.",
    applyUrl: "https://www.datadoghq.com/startup/",
    rolling: true,
    tags: ["datadog", "observability", "monitoring", "credits"],
  },
  {
    name: "Cloudflare for Startups",
    organization: "Cloudflare",
    organizationUrl: "https://www.cloudflare.com/forstartups/",
    description:
      "Free Cloudflare Workers, R2, D1, KV, Durable Objects, and Pages for eligible startups — plus enterprise-grade Magic Transit, Argo Smart Routing, and Cloudflare Access trial credits. Partnered with most major accelerators and VCs for instant approval.",
    value: "Free Cloudflare Workers/R2/D1/Pages + enterprise trial",
    category: "Cloud · Edge",
    ecosystem: "Any",
    eligibility: "Pre-Series B startups via partner-affiliated program.",
    applyUrl: "https://www.cloudflare.com/forstartups/",
    rolling: true,
    tags: ["cloudflare", "edge", "workers", "r2"],
  },

  // === AI / model infra credits (added 2026-05-17) ===
  {
    name: "Replicate for Startups",
    organization: "Replicate",
    organizationUrl: "https://replicate.com/startups",
    description:
      "Credit program for early-stage startups running ML models on Replicate's hosted GPU infra. Run thousands of open models including Stable Diffusion, Llama, Flux, Whisper, custom models. Useful for AI builders that need scale-to-zero inference without managing GPUs.",
    value: "Up to $10k in credits",
    category: "Compute · GPU + Model Inference",
    ecosystem: "Any",
    eligibility: "Pre-seed / seed AI startups < 2 years",
    applyUrl: "https://replicate.com/startups",
    rolling: true,
    tags: ["replicate", "ml", "inference", "gpu", "ai"],
  },
  {
    name: "Modal Startup Program",
    organization: "Modal Labs",
    organizationUrl: "https://modal.com/",
    description:
      "Serverless GPU compute for AI workloads. Startup program offers credits and dedicated support for AI builders training/serving models. Common stack for AI agents, RAG, and ML inference pipelines.",
    value: "Up to $25k in credits",
    category: "Compute · GPU Serverless",
    ecosystem: "Any",
    eligibility: "Pre-seed / seed AI startups",
    applyUrl: "https://modal.com/startups",
    rolling: true,
    tags: ["modal", "gpu", "serverless", "ai"],
  },
  {
    name: "Lambda Cloud Startup Credits",
    organization: "Lambda",
    organizationUrl: "https://lambda.ai/cloud",
    description:
      "GPU cloud credits for early-stage AI startups. H100 / H200 / B200 instances on demand. Direct access via the Lambda startup contact for teams scaling training or large-batch inference.",
    value: "Negotiated credits + capacity",
    category: "Compute · GPU Cloud",
    ecosystem: "Any",
    eligibility: "Pre-seed / seed AI startups",
    applyUrl: "https://lambda.ai/cloud",
    rolling: true,
    tags: ["lambda", "gpu", "h100", "training"],
  },
  {
    name: "Together AI Startup Program",
    organization: "Together AI",
    organizationUrl: "https://www.together.ai/",
    description:
      "Inference API + fine-tuning credits for open models (Llama, Qwen, Mixtral, DeepSeek). Useful when you need open-weight inference at scale without an OpenAI / Anthropic dependency.",
    value: "Up to $25k in credits",
    category: "Compute · Open-Model Inference",
    ecosystem: "Any",
    eligibility: "Pre-seed / seed AI startups",
    applyUrl: "https://www.together.ai/startups",
    rolling: true,
    tags: ["together", "open-models", "llama", "inference"],
  },
  {
    name: "Cohere for Startups",
    organization: "Cohere",
    organizationUrl: "https://cohere.com/startups",
    description:
      "API credits for Cohere's Command, Embed, and Rerank models. Targeted at enterprise / retrieval-heavy AI use cases. Includes dedicated technical support and early-access to new releases.",
    value: "Up to $5k in API credits",
    category: "Model API · LLMs + Embeddings",
    ecosystem: "Any",
    eligibility: "Pre-seed / seed startups < 5 years, < $5M revenue",
    applyUrl: "https://cohere.com/startups",
    rolling: true,
    tags: ["cohere", "rag", "embeddings", "enterprise"],
  },
  {
    name: "Pinecone Startup Program",
    organization: "Pinecone",
    organizationUrl: "https://www.pinecone.io/startup-program/",
    description:
      "Vector database credits for AI startups building RAG and semantic search. Includes free Standard tier capacity for 12 months. Used widely as the default vector store for RAG-based AI agents.",
    value: "Free Standard tier (~$5k value) for 12 months",
    category: "Data · Vector DB",
    ecosystem: "Any",
    eligibility: "Pre-seed / seed startups < 2 years, < $5M funding",
    applyUrl: "https://www.pinecone.io/startup-program/",
    rolling: true,
    tags: ["pinecone", "vector-db", "rag", "ai"],
  },
  {
    name: "ElevenLabs for Startups",
    organization: "ElevenLabs",
    organizationUrl: "https://elevenlabs.io/",
    description:
      "Discounted Scale-plan access for AI builders shipping voice — agents, audiobooks, dubbing, real-time conversation. Top voice infra for production agent UX.",
    value: "Discounted Scale plan",
    category: "Model API · Voice",
    ecosystem: "Any",
    eligibility: "Early-stage startups shipping voice products",
    applyUrl: "https://elevenlabs.io/",
    rolling: true,
    tags: ["elevenlabs", "voice", "tts", "agents"],
  },
  {
    name: "Hugging Face Pro for Startups",
    organization: "Hugging Face",
    organizationUrl: "https://huggingface.co/enterprise",
    description:
      "Hugging Face Pro / Enterprise Hub for early-stage AI teams. Private model + dataset hosting, ZeroGPU access, Spaces credits. Common stack for ML teams shipping research-to-product.",
    value: "Discounted Pro / Enterprise plan",
    category: "Data · Model + Dataset Hosting",
    ecosystem: "Any",
    eligibility: "Pre-seed / seed AI startups",
    applyUrl: "https://huggingface.co/enterprise",
    rolling: true,
    tags: ["huggingface", "ml", "spaces", "ai"],
  },

  // === Web3 startup programs (added 2026-05-17) ===
  {
    name: "Tenderly Startup Program",
    organization: "Tenderly",
    organizationUrl: "https://tenderly.co/",
    description:
      "Free Pro tier of Tenderly's Web3 development platform for early-stage teams — debugger, simulator, gas profiler, alerting, virtual TestNets. The default observability stack for production EVM teams.",
    value: "Free Pro tier credits",
    category: "Infra · EVM Tooling",
    ecosystem: "Multi-chain (EVM)",
    eligibility: "Pre-seed / seed Web3 startups",
    applyUrl: "https://tenderly.co/startups",
    rolling: true,
    tags: ["tenderly", "evm", "debugging", "observability"],
  },
  {
    name: "thirdweb Engine for Startups",
    organization: "thirdweb",
    organizationUrl: "https://thirdweb.com/startups",
    description:
      "Free / discounted access to thirdweb Engine — production wallet infra, gas sponsorship, smart wallets, server-side transaction execution. Used by Coinbase Wallet, Animoca, Shopify.",
    value: "Free Engine credits + discounted Growth plan",
    category: "Infra · Wallet + Smart Contract",
    ecosystem: "Multi-chain",
    eligibility: "Early-stage Web3 startups",
    applyUrl: "https://thirdweb.com/startups",
    rolling: true,
    tags: ["thirdweb", "wallet", "engine", "smart-contracts"],
  },
  {
    name: "Privy Startup Program",
    organization: "Privy",
    organizationUrl: "https://www.privy.io/startups",
    description:
      "Free Privy embedded wallet credits for early-stage builders. Privy is the default auth + wallet stack for Web3 consumer apps — used by Hyperliquid, Farcaster apps. Email + social login → custodial wallet, with progressive non-custodial transition.",
    value: "Up to $5k in credits or free Starter tier",
    category: "Infra · Auth + Wallet",
    ecosystem: "Multi-chain",
    eligibility: "Pre-seed / seed Web3 startups",
    applyUrl: "https://www.privy.io/startups",
    rolling: true,
    tags: ["privy", "wallet", "auth", "embedded"],
  },
  {
    name: "Coinbase Developer Platform for Startups",
    organization: "Coinbase",
    organizationUrl: "https://www.coinbase.com/developer-platform",
    description:
      "Coinbase Developer Platform credits — Smart Wallet, x402 payments, AgentKit, OnchainKit, Base node access. Includes warm intros into Coinbase Ventures' check pipeline for promising teams.",
    value: "API credits + ecosystem access",
    category: "Infra · Wallet + RPC + AI Agent SDK",
    ecosystem: "Base / Ethereum",
    eligibility: "Builders on Coinbase Developer Platform",
    applyUrl: "https://www.coinbase.com/developer-platform",
    rolling: true,
    tags: ["coinbase", "cdp", "base", "agentkit"],
  },

  // === Free stuff (added 2026-05-17) ===
  // Zero-friction free tiers and open resources — no application, no equity,
  // no "talk to sales." Just sign up (or don't) and use. The bar: a solo
  // builder can ship a real prototype on these alone in a weekend, $0 spent.
  {
    name: "Google AI Studio (Gemini API)",
    organization: "Google",
    organizationUrl: "https://aistudio.google.com/",
    description:
      "Free access to Gemini 2.x models via API key — 1.5 Flash, 2.0 Flash, 2.5 Pro experimental — with generous free-tier quotas (millions of tokens/day on Flash). No credit card required. The most generous frontier-model free tier currently available; common starter for AI agents and prototypes.",
    value: "Free API key, millions of tokens/day",
    category: "Free · AI API",
    ecosystem: "Any",
    eligibility: "Anyone with a Google account.",
    applyUrl: "https://aistudio.google.com/apikey",
    rolling: true,
    tags: ["gemini", "google", "ai", "free-tier", "no-application"],
  },
  {
    name: "Groq Cloud Free Tier",
    organization: "Groq",
    organizationUrl: "https://groq.com/",
    description:
      "Free API access to fast open-model inference (Llama 3.x, Mixtral, DeepSeek, Whisper) running on Groq's LPU hardware. Low-latency completions (often <500ms TTFT) make this the default pick for real-time agents and voice. Free tier covers rate-limited daily quotas, no credit card.",
    value: "Free API, rate-limited",
    category: "Free · AI API",
    ecosystem: "Any",
    eligibility: "Anyone with an email.",
    applyUrl: "https://console.groq.com/keys",
    rolling: true,
    tags: ["groq", "llama", "inference", "free-tier", "fast"],
  },
  {
    name: "HuggingFace Inference Providers Free Tier",
    organization: "Hugging Face",
    organizationUrl: "https://huggingface.co/",
    description:
      "Free API access to thousands of open models via HuggingFace's Inference Providers (Together, Fireworks, Replicate, SambaNova, etc.) — Llama, Qwen, DeepSeek, Flux, Whisper, custom checkpoints. Free monthly credits for any signed-in user. No card required to start.",
    value: "Free monthly credits across all providers",
    category: "Free · AI API",
    ecosystem: "Any",
    eligibility: "Anyone with a HuggingFace account.",
    applyUrl: "https://huggingface.co/settings/tokens",
    rolling: true,
    tags: ["huggingface", "open-models", "inference", "free-tier"],
  },
  {
    name: "Mistral La Plateforme Free Tier",
    organization: "Mistral AI",
    organizationUrl: "https://mistral.ai/",
    description:
      "Free experimentation tier on Mistral's hosted API — Mistral Large, Small, Codestral, and Embed. Free quota with rate limits, no credit card to start. EU-hosted; useful when you need data residency in Europe.",
    value: "Free experimentation tier",
    category: "Free · AI API",
    ecosystem: "Any",
    eligibility: "Anyone with an email.",
    applyUrl: "https://console.mistral.ai/",
    rolling: true,
    tags: ["mistral", "ai", "codestral", "eu", "free-tier"],
  },
  {
    name: "DefiLlama API",
    organization: "DefiLlama",
    organizationUrl: "https://defillama.com/",
    description:
      "Completely free, no-key public API for DeFi TVL, prices, yields, stablecoins, bridges, and chain stats across every major chain. The de-facto open data layer for DeFi analytics — used by most of the major dashboards and research desks. No rate limits in practice for normal use.",
    value: "Free forever, no API key required",
    category: "Free · Data",
    ecosystem: "Multi-chain",
    eligibility: "No signup.",
    applyUrl: "https://defillama.com/docs/api",
    rolling: true,
    tags: ["defillama", "tvl", "data", "no-key", "open"],
  },
  {
    name: "CoinGecko Public API",
    organization: "CoinGecko",
    organizationUrl: "https://www.coingecko.com/",
    description:
      "Free public API for token prices, market caps, historical data, exchanges, and on-chain metrics across 15k+ tokens. Public endpoint requires no key (rate-limited to ~30 req/min); a free Demo plan gives a key + 10k calls/month. Standard price oracle for indie tools.",
    value: "Free, no key (or free Demo key)",
    category: "Free · Data",
    ecosystem: "Multi-chain",
    eligibility: "No signup needed for public tier.",
    applyUrl: "https://www.coingecko.com/api/pricing",
    rolling: true,
    tags: ["coingecko", "prices", "data", "free-tier"],
  },
  {
    name: "Etherscan API Free Tier",
    organization: "Etherscan",
    organizationUrl: "https://etherscan.io/",
    description:
      "Free API tier for the Etherscan family of explorers (Ethereum mainnet + L2s via the unified V2 API) — 100k calls/day, 5 req/sec. Covers transactions, logs, contract ABIs, token balances, gas. Free key issued instantly on signup. Default lookup layer for any EVM tool.",
    value: "100k calls/day free",
    category: "Free · Data",
    ecosystem: "Multi-chain (EVM)",
    eligibility: "Free Etherscan account.",
    applyUrl: "https://etherscan.io/apis",
    rolling: true,
    tags: ["etherscan", "evm", "explorer", "free-tier"],
  },
  {
    name: "The Graph Free Queries",
    organization: "The Graph",
    organizationUrl: "https://thegraph.com/",
    description:
      "100k free queries/month on The Graph's decentralized indexing network — subgraphs for every major EVM chain, plus growing Solana / non-EVM coverage. No credit card to start. Free quota is enough for prototypes and small dashboards before any paid scaling.",
    value: "100k queries/month free",
    category: "Free · Data",
    ecosystem: "Multi-chain",
    eligibility: "Free The Graph account.",
    applyUrl: "https://thegraph.com/studio/",
    rolling: true,
    tags: ["thegraph", "subgraphs", "indexing", "free-tier"],
  },
  {
    name: "Alchemy Free Tier",
    organization: "Alchemy",
    organizationUrl: "https://www.alchemy.com/",
    description:
      "Free Alchemy account = 300M compute units/month across Ethereum, Solana, Base, Polygon, Arbitrum, Optimism, and 40+ chains. Includes enhanced APIs (NFT, transfers, gas, transaction simulation), webhook notifications, and the Embedded Wallets SDK. No credit card. Separate from Alchemy's gated startup credits program.",
    value: "300M CU/month free",
    category: "Free · RPC",
    ecosystem: "Multi-chain",
    eligibility: "Free Alchemy account.",
    applyUrl: "https://dashboard.alchemy.com/signup",
    rolling: true,
    tags: ["alchemy", "rpc", "multi-chain", "free-tier"],
  },
  {
    name: "Helius Free Tier",
    organization: "Helius Labs",
    organizationUrl: "https://www.helius.dev/",
    description:
      "Free Helius account for Solana — 100k credits/month, DAS API access (compressed NFTs, token metadata), enhanced webhooks, and standard RPC. The fastest path to a working Solana indexer without managing your own node. Separate from Helius's gated startup credits program.",
    value: "100k credits/month free",
    category: "Free · RPC",
    ecosystem: "Solana",
    eligibility: "Free Helius account.",
    applyUrl: "https://dashboard.helius.dev/",
    rolling: true,
    tags: ["helius", "solana", "rpc", "free-tier"],
  },
  {
    name: "Ankr Public RPC",
    organization: "Ankr",
    organizationUrl: "https://www.ankr.com/rpc/",
    description:
      "Free public RPC endpoints for 75+ chains — Ethereum, Solana, Polygon, BNB, Base, Optimism, Arbitrum, Avalanche, and most major L2s. No signup, no key, no rate limit on the public tier (best-effort throughput). Useful as a zero-config backup or for prototype dApps.",
    value: "Free public RPC, no key",
    category: "Free · RPC",
    ecosystem: "Multi-chain",
    eligibility: "No signup.",
    applyUrl: "https://www.ankr.com/rpc/",
    rolling: true,
    tags: ["ankr", "rpc", "public", "multi-chain"],
  },
  {
    name: "Vercel Hobby",
    organization: "Vercel",
    organizationUrl: "https://vercel.com/pricing",
    description:
      "Vercel's free-forever Hobby tier — unlimited deployments, automatic SSL, serverless + edge functions, 100GB bandwidth/month, preview deploys. The default zero-friction host for Next.js, SvelteKit, Nuxt, Astro, Remix. Separate from the gated Vercel for Startups credits program.",
    value: "Free forever, 100GB bandwidth",
    category: "Free · Hosting",
    ecosystem: "Any",
    eligibility: "Personal use; cannot be used commercially.",
    applyUrl: "https://vercel.com/signup",
    rolling: true,
    tags: ["vercel", "hosting", "nextjs", "free-tier"],
  },
  {
    name: "Cloudflare Workers + Pages Free Tier",
    organization: "Cloudflare",
    organizationUrl: "https://workers.cloudflare.com/",
    description:
      "Free-forever Workers (100k requests/day, 10ms CPU), Pages (unlimited deploys, unlimited bandwidth), KV (100k reads/day), R2 (10GB storage), D1 (5GB SQLite). Among the most generous free tiers in serverless. Production-ready for indie SaaS and dApp front-ends.",
    value: "Free forever, 100k Worker req/day + unlimited Pages",
    category: "Free · Hosting",
    ecosystem: "Any",
    eligibility: "Free Cloudflare account.",
    applyUrl: "https://dash.cloudflare.com/sign-up",
    rolling: true,
    tags: ["cloudflare", "workers", "pages", "r2", "free-tier"],
  },
  {
    name: "Supabase Free Tier",
    organization: "Supabase",
    organizationUrl: "https://supabase.com/pricing",
    description:
      "Free Postgres database (500MB), auth (50k MAU), storage (1GB), edge functions (500k invocations/month), and realtime subscriptions. Open-source Firebase alternative — the standard stack for prototyping anything with users + data. Free projects pause after a week of inactivity.",
    value: "Free Postgres + auth + storage + edge",
    category: "Free · Hosting",
    ecosystem: "Any",
    eligibility: "Free Supabase account.",
    applyUrl: "https://supabase.com/dashboard/sign-up",
    rolling: true,
    tags: ["supabase", "postgres", "auth", "storage", "free-tier"],
  },
  {
    name: "Neon Free Tier",
    organization: "Neon",
    organizationUrl: "https://neon.tech/pricing",
    description:
      "Free serverless Postgres — 0.5GB storage, autoscaling compute (scale-to-zero), database branching for preview environments. Connection-pooling and Postgres extensions out of the box. Among the best free DB tiers for prototypes that need a real Postgres.",
    value: "Free Postgres, branching, scale-to-zero",
    category: "Free · Hosting",
    ecosystem: "Any",
    eligibility: "Free Neon account.",
    applyUrl: "https://console.neon.tech/signup",
    rolling: true,
    tags: ["neon", "postgres", "serverless", "free-tier"],
  },
  {
    name: "GitHub Free",
    organization: "GitHub",
    organizationUrl: "https://github.com/pricing",
    description:
      "Unlimited public + private repos, unlimited collaborators, 2000 Actions minutes/month (Linux), 500MB Packages storage, GitHub Pages, Copilot Free (limited completions + chat). The default home for code; Copilot Free included since 2025 makes this materially more valuable than it used to be.",
    value: "Free forever — repos + Actions + Copilot Free",
    category: "Free · DevTools",
    ecosystem: "Any",
    eligibility: "Free GitHub account.",
    applyUrl: "https://github.com/signup",
    rolling: true,
    tags: ["github", "git", "actions", "copilot"],
  },
  {
    name: "Cursor Free",
    organization: "Cursor",
    organizationUrl: "https://cursor.com/pricing",
    description:
      "Free tier of the Cursor AI editor — 2000 completions/month and 50 slow premium requests (GPT-4 / Claude / Gemini) per month. Enough to evaluate the AI-coding workflow before committing to Pro. Same VS Code-derived UX that's become the default editor for AI-native developers.",
    value: "Free tier — 2000 completions/month",
    category: "Free · DevTools",
    ecosystem: "Any",
    eligibility: "Free Cursor account.",
    applyUrl: "https://cursor.com/",
    rolling: true,
    tags: ["cursor", "editor", "ai-coding", "free-tier"],
  },
  {
    name: "Solana Cookbook",
    organization: "Solana Foundation",
    organizationUrl: "https://solana.com/developers/cookbook",
    description:
      "Free, open-source cookbook of Solana dev recipes — token creation, NFT minting, SPL transfers, on-chain program patterns, wallet integration, with code samples in TypeScript, Rust, and Python. The canonical starting point for Solana developers; maintained by the Foundation + community.",
    value: "Free open resource",
    category: "Free · Education",
    ecosystem: "Solana",
    eligibility: "Free; no signup.",
    applyUrl: "https://solana.com/developers/cookbook",
    rolling: true,
    tags: ["solana", "education", "cookbook", "open"],
  },
  {
    name: "Cyfrin Updraft",
    organization: "Cyfrin",
    organizationUrl: "https://updraft.cyfrin.io/",
    description:
      "Free Solidity + smart-contract security courses from Patrick Collins / Cyfrin — beginner Solidity, advanced Foundry, security review, assembly, ZK basics. Among the highest-signal free Web3 dev curricula; the security tracks pull directly from production audit experience.",
    value: "Free courses, no signup",
    category: "Free · Education",
    ecosystem: "EVM",
    eligibility: "Free; account optional for progress tracking.",
    applyUrl: "https://updraft.cyfrin.io/",
    rolling: true,
    tags: ["cyfrin", "solidity", "security", "education"],
  },
  {
    name: "Speedrun Ethereum",
    organization: "BuidlGuidl",
    organizationUrl: "https://speedrunethereum.com/",
    description:
      "Free hands-on challenges for learning Ethereum dev with Scaffold-ETH — build NFT contracts, staking apps, DEXes, and dynamic SVG NFTs from scratch. Each challenge is a working repo you fork and complete. Run by BuidlGuidl (Austin Griffith); pipelines top builders into the BuidlGuidl community.",
    value: "Free challenges, no signup",
    category: "Free · Education",
    ecosystem: "Ethereum",
    eligibility: "Free.",
    applyUrl: "https://speedrunethereum.com/",
    rolling: true,
    tags: ["speedrun", "ethereum", "scaffold-eth", "education"],
  },
  {
    name: "CryptoZombies",
    organization: "Loom Network",
    organizationUrl: "https://cryptozombies.io/",
    description:
      "Free, gamified Solidity course — build a zombie-themed CryptoKitties-style game contract lesson by lesson. Covers Solidity fundamentals, ERC-721, Web3.js, and advanced patterns across 6+ courses. The canonical interactive entry point for Solidity beginners; ~400k+ developers have run through it.",
    value: "Free interactive lessons",
    category: "Free · Education",
    ecosystem: "Ethereum",
    eligibility: "Free; account optional for progress tracking.",
    applyUrl: "https://cryptozombies.io/",
    rolling: true,
    tags: ["cryptozombies", "solidity", "ethereum", "education", "interactive"],
  },
  {
    name: "Anthropic Cookbook",
    organization: "Anthropic",
    organizationUrl: "https://github.com/anthropics/anthropic-cookbook",
    description:
      "Open-source cookbook of Claude API recipes — tool use, computer use, RAG, prompt caching, citations, sub-agents, batch processing, fine-tuning. Maintained by Anthropic. The canonical reference for production Claude usage patterns; pairs with the API free credits to build a working AI agent in an afternoon.",
    value: "Free open-source recipes",
    category: "Free · Education",
    ecosystem: "Any",
    eligibility: "Free.",
    applyUrl: "https://github.com/anthropics/anthropic-cookbook",
    rolling: true,
    tags: ["anthropic", "claude", "cookbook", "ai", "open"],
  },
  {
    name: "0x API Free Tier",
    organization: "0x",
    organizationUrl: "https://0x.org/docs/introduction/getting-started",
    description:
      "0x's Swap and Gasless APIs power most onchain trading UIs (Coinbase Wallet, Matcha, Robinhood Web3). The entry plan ships with a generous free request allowance on Swap API plus access to the 0x dashboard for monitoring volume and adjusting fees. Builders can graduate to Growth or Scale tiers as volume grows, with credits available for teams shipping consumer trading products.",
    value: "Free Swap API tier + dashboard",
    category: "Infra · DEX API",
    ecosystem: "Multi-chain",
    eligibility: "Self-serve. Any builder using 0x Swap or Gasless API.",
    applyUrl: "https://dashboard.0x.org/",
    rolling: true,
    tags: ["0x", "dex", "swap", "api", "trading"],
  },
  {
    name: "DigitalOcean Hatch",
    organization: "DigitalOcean",
    organizationUrl: "https://www.digitalocean.com/hatch",
    description:
      "DigitalOcean's startup program. Up to $100k in cloud credits valid for 12 months, plus $0 priority support, free architecture review, and access to the Hatch community for early-stage teams. Pre-Series A founders apply directly; accelerator alumni get auto-approved. Aimed at teams who want predictable pricing without AWS/GCP sprawl.",
    value: "Up to $100k DO credits + priority support",
    category: "Cloud · Credits",
    ecosystem: "Any",
    eligibility: "Pre-Series A startups <5 years old, <$10M raised. Accelerator alumni auto-approved.",
    applyUrl: "https://www.digitalocean.com/hatch",
    rolling: true,
    tags: ["digitalocean", "cloud", "credits", "hatch"],
  },
  {
    name: "Dynamic Free Plan",
    organization: "Dynamic",
    organizationUrl: "https://www.dynamic.xyz/pricing",
    description:
      "Dynamic is an embedded wallet + auth stack (the main alternative to Privy) used by Story, Magic Eden, and Layer3. The Free plan covers up to 1,000 monthly active users with email/social login, multi-chain wallets (EVM + Solana), and progressive non-custodial onboarding. Paid Standard tier kicks in above MAU thresholds with team management and advanced analytics.",
    value: "Free up to 1k MAUs",
    category: "Infra · Auth + Wallet",
    ecosystem: "Multi-chain",
    eligibility: "Self-serve signup. Free plan auto-applied below MAU threshold.",
    applyUrl: "https://app.dynamic.xyz/",
    rolling: true,
    tags: ["dynamic", "wallet", "auth", "embedded"],
  },
  {
    name: "GoldRush by Covalent Free Tier",
    organization: "Covalent",
    organizationUrl: "https://goldrush.dev/pricing",
    description:
      "GoldRush (formerly Covalent) provides unified onchain data APIs across 200+ chains — balances, NFTs, transactions, decoded logs, and historical pricing. The free tier includes 100k credits per month with rate limits suitable for prototypes and indie projects. Premium plans unlock higher throughput, real-time streams, and tax/accounting endpoints. Strong fit for portfolio trackers, analytics dashboards, and AI agents that need multi-chain state.",
    value: "100k API credits / month free",
    category: "Infra · Data API",
    ecosystem: "Multi-chain",
    eligibility: "Self-serve. Free tier on signup.",
    applyUrl: "https://goldrush.dev/platform/",
    rolling: true,
    tags: ["covalent", "goldrush", "data", "api", "multi-chain"],
  },
  {
    name: "Neynar Free Tier",
    organization: "Neynar",
    organizationUrl: "https://neynar.com/#pricing",
    description:
      "Neynar is the dominant API/Hub provider for Farcaster — the social graph layer most consumer crypto apps build on. The free Starter tier covers 1k API requests per day, sufficient for prototyping bots, frames, and notification flows. Growth and Scale tiers add webhooks, signer management, and dedicated Hub infrastructure. Documentation includes ready-to-fork Frame templates and a casts.json export tool.",
    value: "Free Starter tier (1k req/day)",
    category: "Infra · Social API",
    ecosystem: "Farcaster",
    eligibility: "Self-serve signup.",
    applyUrl: "https://dev.neynar.com/",
    rolling: true,
    tags: ["neynar", "farcaster", "social", "api", "frames"],
  },
  {
    name: "Lighthouse Free Storage",
    organization: "Lighthouse",
    organizationUrl: "https://lighthouse.storage/",
    description:
      "Lighthouse is a perpetual storage layer built on Filecoin — pay once, store forever (no recurring fees). Free tier includes 3GB of perpetual storage with public file links, file encryption, and IPFS pinning. Builders can use it for NFT metadata, public datasets, agent memory exports, or backup snapshots. SDKs in JS, Python, and Rust; works without a credit card.",
    value: "3GB free perpetual storage",
    category: "Infra · Storage",
    ecosystem: "Multi-chain",
    eligibility: "Self-serve signup, no card required.",
    applyUrl: "https://files.lighthouse.storage/",
    rolling: true,
    tags: ["lighthouse", "filecoin", "ipfs", "storage", "perpetual"],
  },
  {
    name: "Loop Crypto No-Fee Tier",
    organization: "Loop Crypto",
    organizationUrl: "https://www.loopcrypto.xyz/",
    description:
      "Loop Crypto handles onchain recurring payments and subscriptions — stablecoin invoicing, autopay, and B2B checkout flows. New accounts process the first $5,000 in payments with zero platform fees. Useful for SaaS builders moving from Stripe to onchain billing, or for crypto-native apps that need recurring revenue without custodial rails. Supports USDC, USDT, DAI on Ethereum, Base, Polygon, and Optimism.",
    value: "No platform fees on first $5k processed",
    category: "Payments · Subscriptions",
    ecosystem: "Multi-chain",
    eligibility: "New accounts, self-serve signup.",
    applyUrl: "https://app.loopcrypto.xyz/",
    rolling: true,
    tags: ["loop", "payments", "subscriptions", "stablecoin"],
  },
  {
    name: "Sherlock Audit Contests",
    organization: "Sherlock",
    organizationUrl: "https://www.sherlock.xyz/",
    description:
      "Sherlock runs crowdsourced smart-contract audit contests — protocols post a bounty pool, vetted Watson auditors compete to find issues, and a head-judge rules on validity. Typical pool sizes run $30k–$150k for a 7–14 day contest, often delivering more findings than a single-firm audit at comparable cost. Pricing is public on the Sherlock site; teams apply via the protocol intake form.",
    value: "Crowdsourced audits, ~$30k–$150k pools",
    category: "Security · Audits",
    ecosystem: "Multi-chain",
    eligibility: "Protocols with deployable Solidity code (mainnet, L2, or EVM-compatible).",
    applyUrl: "https://www.sherlock.xyz/audits",
    rolling: true,
    tags: ["sherlock", "audit", "security", "contests"],
  },
  {
    name: "Immunefi Bug Bounty Program",
    organization: "Immunefi",
    organizationUrl: "https://immunefi.com/explore/",
    description:
      "Immunefi is the largest crypto bug bounty platform — projects post bounty pools (typically a % of TVL up to $10M+) and whitehats submit vulnerability reports. Listing a bounty is free; payouts only trigger on validated findings. Graduated projects also qualify for free PR Review — pre-merge security checks from Immunefi triagers on critical pull requests. Production teams without an internal security org should default-list here.",
    value: "Free bounty listing + PR review for graduates",
    category: "Security · Bug Bounty",
    ecosystem: "Multi-chain",
    eligibility: "Live or pre-launch protocols with a credible bounty pool (typically 5–10% of TVL).",
    applyUrl: "https://immunefi.com/launch-bounty/",
    rolling: true,
    tags: ["immunefi", "bug-bounty", "security", "audits"],
  },
  {
    name: "Basenames",
    organization: "Coinbase",
    organizationUrl: "https://www.base.org/names",
    description:
      "Basenames are .base.eth identities issued on Base by Coinbase — onchain usernames that resolve to your wallet, profile, and Smart Wallet. Names ≥6 characters are free to register; shorter names follow a Dutch-auction pricing curve. Free names cover the first year, renew for ~$5/yr afterward. Pairs naturally with Smart Wallet, Farcaster, and any Base app — most consumer Base UIs auto-resolve Basenames in place of 0x addresses.",
    value: "Free .base.eth names (6+ chars)",
    category: "Free · Identity",
    ecosystem: "Base",
    eligibility: "Anyone with a Base-compatible wallet.",
    applyUrl: "https://www.base.org/names",
    rolling: true,
    tags: ["basenames", "base", "ens", "identity", "free"],
  },
];

async function upsert(payload: PerksPayload) {
  const existing = await db
    .select({ id: submissions.id, publicId: submissions.publicId })
    .from(submissions)
    .where(
      and(
        eq(submissions.type, "perks"),
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
      type: "perks",
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
  for (const p of perks) {
    const r = await upsert(p);
    if (r.action === "inserted") inserted++;
    else updated++;
    console.log(`  ${r.action.padEnd(8)} /perks/${r.publicId}  ${p.name}`);
  }
  console.log(
    `\n✓ ${perks.length} perks processed (${inserted} new, ${updated} updated).`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
