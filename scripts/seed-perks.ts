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
