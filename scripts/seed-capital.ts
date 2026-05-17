/**
 * Run with: npx tsx scripts/seed-capital.ts
 *
 * Seeds /intel?lane=capital — VC funds with public, currently-active pitch
 * portals or explicit cold-inbound channels. Distinct from accelerators:
 * no cohort, no fixed program, just rolling first-check capital.
 *
 * Curation rule: only seed entries where the pitchUrl actually leads to a
 * real intake mechanism (form, app, or explicitly-published-and-monitored
 * email). The value of this lane is "click Pitch and you're at the actual
 * portal" — pointing at a fund's homepage when they don't take cold inbound
 * poisons the lane. When in doubt, skip.
 *
 * Crypto-native exception: the entire crypto VC segment runs on intros and
 * email. Holding crypto funds to "must have a Typeform" leaves the lane
 * with zero crypto coverage, which is wrong for our audience. So for
 * crypto funds, a published criteria + an explicitly-monitored email
 * (`info@`, `pitch@`, etc.) qualifies — but only when the firm has openly
 * invited inbound on their site. Pitch link is a `mailto:` in those cases.
 *
 * Source verification dates noted per entry. Re-verify before each batch
 * (funds pause, change forms, or shut down — Calm Fund and Pioneer were
 * candidates that turned out to be inactive in May 2026).
 *
 * Idempotent: matched by payload->>'name'.
 */
import "dotenv/config";
import { and, eq, sql } from "drizzle-orm";
import { db, submissions } from "../src/lib/db";
import type { CapitalPayload } from "../src/lib/db/schema";

const funds: CapitalPayload[] = [
  {
    name: "Redbud VC",
    organization: "Redbud VC",
    organizationUrl: "https://redbud.vc/",
    description:
      "Pre-seed generalist fund out of Columbia, Missouri. First institutional check in 60%+ of portfolio. ~12 investments per year on a rolling basis — no cohort, no batch. Operator partners and a portfolio-wide intro engine (~20 intros in the first six months on average). Backs founders 'strengthened by struggle' over pedigree. 44 portfolio companies; 61% first-time founders, 45% immigrant.",
    stage: "Pre-seed",
    location: "Columbia, MO",
    focus: "Generalist",
    pitchUrl: "https://redbud.vc/pitch",
    decisionWindow: "Decision in ≤3 weeks",
    tags: ["pre-seed", "generalist", "first-check"],
  },
  {
    name: "Hustle Fund",
    organization: "Hustle Fund",
    organizationUrl: "https://www.hustlefund.vc/",
    description:
      "Pre-seed fund that explicitly invests at the 'hilariously early' stage — often pre-product, pre-revenue. Public Typeform pitch process; team commits to a decision in 1–2 meetings and wires within the week. Generalist with a heavy operator-led founder bias.",
    stage: "Pre-seed",
    location: "San Carlos, CA",
    focus: "Generalist · hilariously early",
    pitchUrl: "https://hustlefund.typeform.com/to/UGTnIt",
    decisionWindow: "Decision in 1–2 meetings",
    tags: ["pre-seed", "generalist", "fast"],
  },
  {
    name: "1517 Fund",
    organization: "1517 Fund",
    organizationUrl: "https://1517fund.com/",
    description:
      "Backs dropouts, students, and 'renegade scientists' from idea/R&D through seed. Avg pre-seed check ~$400k; idea-stage tickets from $50k, deep-tech seed up to $1M. Sectors span software, hardware-with-data, deep tech / sci-fi tech, and biotech. Public submission form on the homepage; in-thesis applicants get a response within two weeks.",
    stage: "Pre-seed → Seed",
    checkSize: "$50k–$1M",
    location: "DC / Boston corridor",
    focus: "Deep tech, dropouts, renegade scientists",
    pitchUrl: "https://1517fund.com/",
    decisionWindow: "Response in ≤2 weeks",
    tags: ["pre-seed", "seed", "deep-tech", "biotech", "dropouts"],
  },
  {
    name: "South Park Commons — Founder Fellowship",
    organization: "South Park Commons",
    organizationUrl: "https://southparkcommons.com/",
    description:
      "Community + fellowship for technical founders working from -1 to 0 (pre-idea through pre-launch). Founder Fellowship invests $1M–$10M into venture-scale companies emerging from the community. Six-month residency option carries no cost and no equity. Selective intake — not all members are funded — but the apply form is fully open.",
    stage: "Pre-seed",
    checkSize: "$1M–$10M",
    location: "San Francisco · NYC · Bengaluru",
    focus: "Technical founders, -1 to 0",
    pitchUrl: "https://southparkcommons.com/apply",
    tags: ["pre-seed", "fellowship", "technical-founders"],
  },
  {
    name: "Multicoin Capital — Venture Fund III",
    organization: "Multicoin Capital",
    organizationUrl: "https://multicoin.capital/",
    description:
      "Crypto-native investor across DeFi, stablecoins, RWAs, on-chain labor markets, and infrastructure. Venture Fund III writes $1M–$50M tickets into early-stage crypto companies. No public pitch form, but the firm explicitly invites inbound at hello@multicoin.capital — a clear description plus diligence-ready resources is the requested format.",
    stage: "Seed → Series A",
    checkSize: "$1M–$50M",
    focus: "Crypto / DeFi / infra",
    pitchUrl: "mailto:hello@multicoin.capital",
    tags: ["crypto", "defi", "infra", "venture"],
  },
  {
    name: "Right Side Capital Management",
    organization: "Right Side Capital Management",
    organizationUrl: "https://www.rightsidecapital.com/",
    description:
      "Quantitative pre-seed fund for capital-efficient tech companies that are already shipping revenue. Looks for $5k–$30k+ MRR at $1.5M–$4M valuations. Yes-or-no answer in about a week — one of the fastest in the lane. Heavy operator support beyond the check (sales, marketing, fundraising, ops).",
    stage: "Pre-seed",
    checkSize: "$150k–$300k",
    location: "San Francisco, CA",
    focus: "Capital-efficient tech with early revenue",
    pitchUrl: "https://www.rightsidecapital.com/submit",
    decisionWindow: "Decision in ~1 week",
    tags: ["pre-seed", "revenue-stage", "fast", "data-driven"],
  },
  {
    name: "Boost VC",
    organization: "Boost VC",
    organizationUrl: "https://boost.vc/",
    description:
      "Pre-seed checks at $500k apiece into companies aiming to 'make 1 billion lives better.' ~70 investments per year across deep frontier verticals — aerospace, nuclear, robotics, biotech, crypto. Public Fillout pitch form. Long-running fund (since 2012) with strong sci-fi-tech bias.",
    stage: "Pre-seed",
    checkSize: "$500k",
    focus: "Frontier tech — aerospace, robotics, biotech, crypto",
    pitchUrl: "https://boostvc.fillout.com/t/ks1XwgcaYJus",
    tags: ["pre-seed", "frontier-tech", "deep-tech", "crypto"],
  },
  {
    name: "Draper Associates",
    organization: "Draper Associates",
    organizationUrl: "https://draper.vc/",
    description:
      "Tim Draper's $2.3B-AUM early-stage firm — 40+ years, 400+ portfolio companies, multiple unicorns. Five thesis sectors: AI/Robotics, Crypto/Blockchain, Healthcare/Biotech, Aerospace/Space, and Unconventional Ideas. Public 'Submit Your Pitch' link funnels into the firm's intake. Crypto-friendly (Tim Draper is a long-time BTC bull).",
    stage: "Early-stage",
    location: "San Mateo, CA",
    focus: "AI · Crypto · Biotech · Aerospace · Unconventional",
    pitchUrl: "https://draper.vc/contact?autoclick=intro",
    tags: ["early-stage", "crypto", "ai", "biotech", "aerospace"],
  },
  {
    name: "Harlem Capital",
    organization: "Harlem Capital",
    organizationUrl: "https://harlem.capital/",
    description:
      "Pre-seed and seed fund targeting 10%+ ownership in tech companies with $1B+ TAM. US-only. Skips biotech, consumer products and cannabis by policy. Public pitch form on harlem.capital/pitch; team commits to a response within two weeks. 70+ investments across 10+ cities.",
    stage: "Pre-seed → Seed",
    checkSize: "$1M–$2.5M",
    location: "New York, NY (US-only)",
    focus: "Tech with $1B+ TAM",
    pitchUrl: "https://harlem.capital/pitch/",
    decisionWindow: "Response in ≤2 weeks",
    tags: ["pre-seed", "seed", "tech", "us-only", "diversity"],
  },
  {
    name: "BBQ Capital",
    organization: "BBQ Capital",
    organizationUrl: "https://www.bbq.capital/",
    description:
      "Day-one pre-institutional capital — backs founders 12–36 months ahead of when their sectors attract mainstream institutional money. Sector-agnostic. Public 'Pitch Us' form for first-round raisers looking for a partner who shows up beyond the wire.",
    stage: "Pre-seed",
    focus: "Pre-institutional, ahead-of-the-curve sectors",
    pitchUrl: "https://www.bbq.capital/pitch",
    tags: ["pre-seed", "day-one", "generalist"],
  },
  {
    name: "Seedcamp",
    organization: "Seedcamp",
    organizationUrl: "https://seedcamp.com/",
    description:
      "Europe's first-check pre-seed and seed fund out of London. Backs ambitious founders early and stays involved through the first round. Public pitch form on the website routes founders into the investment team. Sector-agnostic — AI, fintech, biotech, software, healthtech all live in the portfolio. Most credible European entry on this lane.",
    stage: "Pre-seed → Seed",
    location: "London, UK",
    focus: "Generalist · European founders",
    pitchUrl: "https://seedcamp.com/out/f6-startup-details",
    tags: ["pre-seed", "seed", "europe", "uk", "generalist"],
  },
  {
    name: "Dragonfly Capital",
    organization: "Dragonfly Capital",
    organizationUrl: "https://www.dragonfly.xyz/",
    description:
      "Crypto-native fund writing $3M–$30M+ tickets from seed through Series B and beyond. Multi-sector across protocols, DeFi, L1/L2s, infrastructure, stablecoins, NFTs, and CeFi. Public contact form with a 'Pitch' topic option that routes inbound directly to the team — one of the few large crypto funds with a real intake path on-site. Offices in NYC and Singapore.",
    stage: "Seed → Series B+",
    checkSize: "$3M–$30M+",
    location: "NYC · Singapore",
    focus: "Crypto · DeFi · L1/L2 · stablecoins",
    pitchUrl: "https://www.dragonfly.xyz/contact",
    tags: ["crypto", "defi", "infra", "venture", "series-a"],
  },
  {
    name: "Electric Capital",
    organization: "Electric Capital",
    organizationUrl: "https://www.electriccapital.com/",
    description:
      "Pre-seed through Series A across crypto, AI, cryptography, distributed systems, fintech, healthcare, energy marketplaces, identity/reputation, and the creator economy. $1M–$15M+ tickets. The firm explicitly invites cold inbound on the homepage — pitch via the published email. Best-known publicly for the Electric Capital Developer Report.",
    stage: "Pre-seed → Series A",
    checkSize: "$1M–$15M+",
    focus: "Crypto · AI · frontier infra",
    pitchUrl: "mailto:info@electriccapital.com",
    tags: ["crypto", "ai", "cryptography", "distributed-systems", "fintech"],
  },
  {
    name: "Pantera Capital",
    organization: "Pantera Capital",
    organizationUrl: "https://panteracapital.com/",
    description:
      "$3.8B-AUM full-spectrum crypto investment firm founded 2003 (pivoted to digital assets 2013). Single committee invests across venture equity, private tokens, liquid tokens, and special situations from one flagship vehicle. 266+ portfolio companies including 16 unicorns and 15 IPOs. Public pitch email is the canonical inbound path. Source verified 2026-05-16.",
    stage: "Seed → growth, tokens included",
    focus: "Full-spectrum crypto — venture, tokens, liquid, special situations",
    location: "Menlo Park, CA",
    pitchUrl: "mailto:pitch@panteracapital.com",
    tags: ["crypto", "tokens", "growth", "defi"],
  },
  {
    name: "Variant Fund",
    organization: "Variant",
    organizationUrl: "https://variant.fund/",
    description:
      "Crypto VC built around the 'user-ownership' thesis — backs decentralized networks that turn users into owners. Combines early-stage seed checks with active liquid token trading from the same firm. Portfolio includes Uniswap, Phantom, World, Morpho, Flashbots, Farcaster, Blockaid, Blackbird. Avg check $250k–$750k. Founded by Jesse Walden (ex-a16z crypto). Public contact form on the site is the cold-inbound path.",
    stage: "Pre-seed → Seed",
    checkSize: "$250k–$750k",
    focus: "Crypto · user-ownership networks · tokens",
    pitchUrl: "https://variant.fund/about/",
    tags: ["crypto", "tokens", "user-ownership", "pre-seed"],
  },
  {
    name: "1kx",
    organization: "1kx",
    organizationUrl: "https://1kx.network/",
    description:
      "Crypto-native fund specializing in token-network design, governance, and community bootstrapping. Deploys seed and Series A checks across infrastructure, middleware, consumer crypto, and digital asset projects. Founded by ex-technology founders Lasse Clausen and Christopher Heymann. Public pitch path is via the site contact channels; the firm responds within a few weeks; warm intros preferred but not required.",
    stage: "Seed → Series A",
    focus: "Token networks · infrastructure · middleware · consumer crypto",
    location: "New York, NY",
    pitchUrl: "https://1kx.network/",
    tags: ["crypto", "tokens", "infrastructure", "consumer"],
  },
  {
    name: "Conviction Embed",
    organization: "Conviction",
    organizationUrl: "https://www.conviction.com/",
    description:
      "AI-native VC by Sarah Guo (host of No Priors, ex-Greylock). Conviction Embed is the firm's structured pre-seed surface — $150k uncapped + $400k+ follow-on for early-stage AI builders. Thesis bias toward 'unsexy AI' infrastructure and Software 3.0. Public application path; check Conviction's site for the current Embed cohort window.",
    stage: "Pre-seed",
    checkSize: "$150k uncapped + $400k+ follow-on",
    focus: "AI-native · Software 3.0 · AI infrastructure",
    pitchUrl: "https://www.conviction.com/",
    tags: ["ai", "pre-seed", "infrastructure", "software-3.0"],
  },
];

async function upsert(payload: CapitalPayload) {
  const existing = await db
    .select({ id: submissions.id, publicId: submissions.publicId })
    .from(submissions)
    .where(
      and(
        eq(submissions.type, "capital"),
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
      type: "capital",
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
  for (const f of funds) {
    const r = await upsert(f);
    if (r.action === "inserted") inserted++;
    else updated++;
    console.log(
      `  ${r.action.padEnd(8)} /capital/${r.publicId}  ${f.name}`,
    );
  }
  console.log(
    `\n✓ ${funds.length} funds processed (${inserted} new, ${updated} updated).`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
