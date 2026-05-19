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
  {
    name: "VNTR",
    organization: "VNTR",
    organizationUrl: "https://www.vntr.vc/",
    description:
      "Global investor community + co-investment syndicate — 5,000+ accredited members across 40+ city chapters (SF, NYC, Toronto, London, Paris, Berlin, Singapore, Hong Kong), 200+ events per year. Not a single fund: VNTR Syndicate runs deal-by-deal co-investments in pre-vetted startups and funds with no participation fees or minimums. Members access deals via private Telegram and email. For founders, the surface is community-mediated: get visible at a VNTR chapter event or warm-intro to the syndicate leads. KYC required for first deal participation. Source verified 2026-05-17.",
    stage: "Pre-seed → growth (deal-by-deal)",
    focus: "Multi-stage syndicate · generalist · global investor network",
    location: "Global · 40+ chapters",
    pitchUrl: "https://app.vntr.vc/",
    tags: ["syndicate", "community", "co-invest", "generalist", "global"],
  },
  {
    name: "BLPN Club",
    organization: "BLPN Club",
    organizationUrl: "https://blpn.club/",
    description:
      "Invite-only, member-led dealmaker club for life sciences — medtech, diagnostics, digital health, biotech. Mantra: 'Find someone to help. Repeat.' Runs the Money Ball Program (structured pitch prep + feedback for founders heading into JPM Week, BIO Week, and the Napa Investor Summit). Membership grants access to the dealmaker network, summits, and founder programming; entry is via invite request form. Surfaced here despite the life-sciences focus because the Money Ball Program is one of the few structured, free pitch-prep surfaces for healthcare founders headed to top-tier investor weeks. Source verified 2026-05-17.",
    stage: "Pre-seed → growth (network access)",
    focus: "Life sciences · medtech · diagnostics · digital health · biotech",
    location: "JPM Week (SF) · BIO Week · Napa Investor Summit",
    pitchUrl: "https://forms.gle/BKJv7wkasWfNcr3z5",
    tags: ["life-sciences", "biotech", "medtech", "dealmaker-club", "invite-only", "pitch-prep"],
  },
  {
    name: "AI Grant",
    organization: "AI Grant",
    organizationUrl: "https://aigrant.com/",
    description:
      "Batch-based accelerator for AI-native product startups backed by Nat Friedman and Daniel Gross ($10M committed). $250k uncapped SAFE per company plus an SF summit and demo day. Open to founders worldwide; managed day-to-day by Hersh Desai and Lenny Bogdonoff. Runs in discrete batches — Batch 4 closed as of May 2026; future cohorts announced on the site and via the support inbox. The canonical inbound path between batches is email; when a batch is open, the public application form on aigrant.com is the surface.",
    stage: "Pre-seed → Seed",
    checkSize: "$250k uncapped SAFE",
    focus: "AI-native products · applied AI",
    location: "San Francisco · global applicants",
    pitchUrl: "mailto:support@aigrant.org",
    tags: ["ai", "pre-seed", "batch", "saf"],
  },
  {
    name: "AGI House Ventures",
    organization: "AGI House",
    organizationUrl: "https://agihouse.org/",
    description:
      "Early-stage AI fund inside the AGI House ecosystem (residence + community + ventures + applied labs) in Hillsborough, CA. Writes up to $1M into AI startups, with deal flow surfaced through the community's merit-based hackathons, dinners, and speaker series. Backed by Eric Schmidt and Marc Andreessen. Founders can apply directly to the ventures fund at agihouse.org/venture, and parallel community access is via app.agihouse.org. Founded 2023 by Rocky Yu.",
    stage: "Pre-seed → Seed",
    checkSize: "Up to $1M",
    focus: "AI · foundation models · generative AI",
    location: "Hillsborough, CA · global community",
    pitchUrl: "https://agihouse.org/venture",
    tags: ["ai", "pre-seed", "seed", "community", "applied-research"],
  },
  {
    name: "Trammell Venture Partners",
    organization: "Trammell Venture Partners",
    organizationUrl: "https://www.tvp.fund/",
    description:
      "Bitcoin-native venture firm based in Austin. Concentrated, high-conviction early-stage investor in Bitcoin entrepreneurs across infrastructure, financial services, and applied L2/Lightning. Partners (Christopher Calicott et al.) have been in the Bitcoin ecosystem since 2009. Portfolio includes Kraken and Voltage among others; $16M+ deployed across vintages. Public contact path on tvp.fund/contact routes founders directly to the team — one of the few Bitcoin-only funds with explicit cold-inbound on-site.",
    stage: "Pre-seed → Seed",
    focus: "Bitcoin · Lightning · L2 · infra",
    location: "Austin, TX",
    pitchUrl: "https://www.tvp.fund/contact/",
    tags: ["bitcoin", "lightning", "pre-seed", "infra"],
  },
  {
    name: "Stillmark",
    organization: "Stillmark",
    organizationUrl: "https://www.stillmark.com/",
    description:
      "Bitcoin-only venture capital firm investing across infrastructure, financial services, scalability, and applications layered on Bitcoin. Portfolio includes Meanwhile (Bitcoin-denominated life insurance), Lightning Labs, Casa, Amboss, Alpen Labs, and Gridless. Explicitly invites founder inbound at founders@stillmark.com — clearest published cold-pitch path of any Bitcoin-focused fund. London-based with global mandate. Source verified 2026-05-17.",
    stage: "Seed → Series A",
    focus: "Bitcoin · Lightning · cryptography · self-custody · mining",
    location: "London · global",
    pitchUrl: "mailto:founders@stillmark.com",
    tags: ["bitcoin", "lightning", "infra", "venture"],
  },
  {
    name: "Founders, Inc.",
    organization: "Founders, Inc.",
    organizationUrl: "https://www.f.inc/",
    description:
      "First-check investor + 42,000 sq ft campus at Fort Mason, San Francisco. Writes $100k–$250k pre-seed checks across AI, AR/VR, B2B, hardware, content creation, and robotics — explicitly sector-agnostic with a heavy frontier-tech bias. The deal includes campus access (workspace, community, hardware lab) alongside the check. Public application form on f.inc/apply with a one-month response SLA.",
    stage: "Pre-seed",
    checkSize: "$100k–$250k",
    focus: "AI · robotics · hardware · AR/VR · frontier tech",
    location: "Fort Mason, San Francisco",
    pitchUrl: "https://www.f.inc/apply",
    decisionWindow: "Response in ≤1 month",
    tags: ["pre-seed", "ai", "robotics", "hardware", "frontier-tech"],
  },
  {
    name: "CoinFund",
    organization: "CoinFund",
    organizationUrl: "https://coinfund.io/",
    description:
      "One of the first crypto-native investment firms (founded 2015) — 105 portfolio companies across six vehicles, spanning AI (Pluralis Research, Prime Intellect), infrastructure (ether.fi, Veda), and fintech (Superstate). Publicly publishes a founders-inbound email — projects@coinfund.io — making it one of the more accessible crypto VCs of its scale. Hands-on partner model with deep operating support beyond the check.",
    stage: "Seed → Series A",
    focus: "Crypto · web3 · DeFi · AI x crypto",
    location: "New York, NY",
    pitchUrl: "mailto:projects@coinfund.io",
    tags: ["crypto", "web3", "defi", "ai", "infra"],
  },
  {
    name: "Khosla Ventures",
    organization: "Khosla Ventures",
    organizationUrl: "https://www.khoslaventures.com/",
    description:
      "Vinod Khosla's multi-stage firm running Seed, Main, and Opportunity funds out of Sand Hill Road. Active across AI, deep tech, cleantech, enterprise software, robotics, and frontier infrastructure. Famous for 'brutal honesty' founder feedback and contrarian, science-first bets. No public Typeform but kv@khoslaventures.com is published as the general inbound; the firm has a public 'Entrepreneurial Resources' section that signals openness to cold contact.",
    stage: "Seed → growth",
    focus: "AI · deep tech · cleantech · enterprise · robotics",
    location: "Menlo Park, CA",
    pitchUrl: "mailto:kv@khoslaventures.com",
    tags: ["ai", "deep-tech", "cleantech", "robotics", "multi-stage"],
  },
  {
    name: "8VC",
    organization: "8VC",
    organizationUrl: "https://www.8vc.com/",
    description:
      "Joe Lonsdale's Austin-based technology firm — invests and co-builds across life sciences, healthcare, manufacturing, enterprise, logistics, and defense. Founded 21 companies in-house since 2016 (studio-style) alongside an external venture book that includes Vercel and Ramp. Public contact path on 8vc.com/contact routes founders to the team. Strong defense / industrial / logistics bias makes it a fit for robotics and AI-applied-to-physical-world builders.",
    stage: "Seed → growth",
    focus: "Defense · industrial · logistics · enterprise · healthcare",
    location: "Austin, TX",
    pitchUrl: "https://www.8vc.com/contact",
    tags: ["defense", "industrial", "logistics", "robotics", "enterprise"],
  },
  {
    name: "Plural",
    organization: "Plural",
    organizationUrl: "https://plural.vc/",
    description:
      "European venture community founded by ex-operators including Taavet Hinrikus (Wise), Khaled Helioui (Bigpoint), and Sten Tamkivi (Skype/Topia). Backs founders building the future of finance and regulated industries; LP-and-operator partnership model rather than a single GP team. Pitch path is hello@plural.vc; the firm is openly inbound-friendly for founders in fintech, frontier finance, and regulated tech across Europe.",
    stage: "Pre-seed → Seed",
    focus: "Fintech · regulated industries · operator-led",
    location: "London · Estonia · Europe",
    pitchUrl: "mailto:hello@plural.vc",
    tags: ["pre-seed", "seed", "europe", "fintech", "operator-led"],
  },
  {
    name: "Framework Ventures",
    organization: "Framework Ventures",
    organizationUrl: "https://www.framework.ventures/",
    description:
      "SF-based crypto-native fund leading early rounds in web3 with check sizes from $250k to $40M+. Launched a $400M DeFi-focused vehicle in 2022; recent deals include $24M into a tokenization/stablecoin chain. Heavy thesis weight on tokenization, blockchain infrastructure, and DeFi primitives. Public contact page is the founder inbound path.",
    stage: "Seed → Series B",
    checkSize: "$250k–$40M",
    focus: "Crypto · DeFi · tokenization · infra",
    location: "San Francisco, CA",
    pitchUrl: "https://www.framework.ventures/contact",
    tags: ["crypto", "defi", "tokenization", "infra", "lead"],
  },
  {
    name: "Hashed",
    organization: "Hashed",
    organizationUrl: "https://hashed.com/",
    description:
      "Web3 investment firm and ecosystem builder headquartered in Seoul with offices in Singapore, San Francisco, and Abu Dhabi. Backs founders across DeFi, gaming, infrastructure, finance, and entertainment; operates two sub-programs — UNOPND (early-stage web3 incubation) and Hashed Emergent (emerging markets). Founder inbound is contact@hashed.com. Strongest cold path into a top-tier Asian crypto fund.",
    stage: "Pre-seed → Series A",
    focus: "Crypto · gaming · infra · emerging markets",
    location: "Seoul · Singapore · SF · Abu Dhabi",
    pitchUrl: "mailto:contact@hashed.com",
    tags: ["crypto", "web3", "gaming", "infra", "asia"],
  },
  {
    name: "Engine Ventures",
    organization: "Engine Ventures",
    organizationUrl: "https://www.engineventures.com/",
    description:
      "Tough Tech venture firm spun out of MIT's The Engine (the 501(c)(3) incubator). Invests early-through-growth in clean energy, advanced materials, semiconductors and optical tech, and applied biotech. Sister org provides lab space, fabrication, and ecosystem programs. Founder inbound is via the general 'Connect' page; in-thesis teams also route through the Engine Fellowship and Pathways programs. Strong fit for hardware/robotics/clean-energy founders with science risk.",
    stage: "Seed → growth",
    focus: "Tough Tech · clean energy · semis · materials · advanced manufacturing",
    location: "Cambridge, MA",
    pitchUrl: "https://www.engineventures.com/contact",
    tags: ["tough-tech", "hardware", "semis", "clean-energy", "robotics"],
  },
  {
    name: "Big Brain Holdings",
    organization: "Big Brain Holdings",
    organizationUrl: "https://www.bigbrain.holdings/",
    description:
      "Multi-strategy investment firm with cypherpunk roots — backs frontier-tech founders across crypto (Solana, Avalanche ecosystems), AI, robotics, deeptech, and consumer. Active across stages and asset types (equity + tokens). Public contact form is the inbound path; team is responsive to project pitches submitted there.",
    stage: "Pre-seed → Series A",
    focus: "Crypto · AI · robotics · deeptech",
    location: "Global",
    pitchUrl: "https://www.bigbrain.holdings/",
    tags: ["crypto", "ai", "robotics", "deeptech", "multi-strategy"],
  },
  {
    name: "Delphi Ventures",
    organization: "Delphi Ventures",
    organizationUrl: "https://delphiventures.io/",
    description:
      "Thesis-driven investor at the intersection of crypto and deep tech, sister org of Delphi Digital research. Backs founders 'at the bleeding edge' across freedom-tech, decentralized coordination, and frontier deep tech. Public Submit Project Google Form is the canonical inbound — uniquely, applications run through 'Bob,' the firm's in-house AI analyst, to speed up triage.",
    stage: "Pre-seed → Seed",
    focus: "Crypto · deep tech · frontier",
    pitchUrl: "https://delphiventures.io/",
    tags: ["crypto", "deep-tech", "frontier", "pre-seed"],
  },
  {
    name: "DCVC",
    organization: "DCVC",
    organizationUrl: "https://www.dcvc.com/",
    description:
      "15-year-old deep tech firm (Palo Alto + SF) backing founders on 'the hardest, highest-stakes problems.' Active across AI applications, climate and clean energy, computational biology and chemistry, industrial transformation, space tech, smart agriculture, and cybersecurity/defense. Portfolio includes Fervo Energy, Pivot Bio, Relation Rx. No public pitch form, but the firm openly publishes its thesis and routes inbound through the general contact path on dcvc.com. Strong fit for science-risk AI and robotics founders.",
    stage: "Seed → growth",
    focus: "AI · climate · industrial · space · defense · agriculture",
    location: "Palo Alto · San Francisco",
    pitchUrl: "https://www.dcvc.com/",
    tags: ["deep-tech", "ai", "climate", "defense", "robotics", "space"],
  },
  {
    name: "Fenbushi Capital",
    organization: "Fenbushi Capital",
    organizationUrl: "https://fenbushi.vc/",
    description:
      "Asia's pioneering web3-focused asset manager — established 2015, $1.6B AUM, 300+ portfolio companies including Ethereum, Polkadot, Filecoin, and The Graph. Multi-stage across L1/L2 infrastructure, DeFi, and CeFi. Public pitch path is projects@fenbushi.vc plus a structured contact form on the site. Most accessible Asia-anchored crypto fund of its scale.",
    stage: "Seed → growth",
    focus: "Crypto · web3 · infra · DeFi · L1/L2",
    location: "Shanghai · Asia",
    pitchUrl: "mailto:projects@fenbushi.vc",
    tags: ["crypto", "web3", "infra", "asia", "multi-stage"],
  },
  {
    name: "Day One Ventures",
    organization: "Day One Ventures",
    organizationUrl: "https://www.dayoneventures.com/",
    description:
      "Early-stage firm that bundles capital with in-house PR and storytelling — pitches mission-driven pioneers on the 'narrative as moat' thesis. Active across AI, fintech, climate & energy, enterprise, future of work, consumer, deep tech, and web3 from seed through Series C. Public contact form on the homepage routes founders to the team; the differentiator is the embedded comms support most VCs don't ship.",
    stage: "Seed → Series C",
    focus: "AI · fintech · climate · web3 · deep tech (comms-first)",
    location: "San Francisco · global",
    pitchUrl: "https://www.dayoneventures.com/",
    tags: ["ai", "fintech", "climate", "web3", "comms", "seed"],
  },
  {
    name: "Long Journey Ventures",
    organization: "Long Journey Ventures",
    organizationUrl: "https://www.longjourney.vc/",
    description:
      "Early-stage firm self-described as 'the second believers in the magically weird' — long-horizon investors in outlier founders dismissed elsewhere as ridiculous. Portfolio includes Uber, SpaceX, Notion, and Anduril (across pre-fund-and-fund eras). Founder inbound is hi@longjourney.vc; the firm explicitly invites cold outreach.",
    stage: "Pre-seed → Seed",
    focus: "Outlier founders · frontier tech · 'magically weird'",
    location: "San Francisco, CA",
    pitchUrl: "mailto:hi@longjourney.vc",
    tags: ["pre-seed", "seed", "frontier-tech", "contrarian"],
  },
  {
    name: "IOSG Ventures",
    organization: "IOSG Ventures",
    organizationUrl: "https://iosg.vc/",
    description:
      "Hong Kong-anchored research-driven web3 fund, established 2017. 100+ portfolio companies including Arbitrum, zkSync, and EigenLayer. Active across base-layer protocols, DeFi, L2/cross-chain, infra, gaming, NFTs/social, and security. Two intake paths: direct email for general pitches, and the Kickstarter Program ($10k–$100k early checks) via a public Google Form. One of the few Asia-headquartered funds with a structured emerging-team intake.",
    stage: "Pre-seed → Series A",
    checkSize: "$10k–$100k (Kickstarter) · larger from main fund",
    focus: "Crypto · DeFi · L2 · infra · gaming · security",
    location: "Hong Kong · Singapore",
    pitchUrl: "https://iosg.vc/",
    tags: ["crypto", "web3", "infra", "asia", "kickstarter-program"],
  },
  {
    name: "UTXO Management",
    organization: "UTXO Management",
    organizationUrl: "https://www.utxo.management/",
    description:
      "Bitcoin-focused capital allocator operating three vehicles: 210k Capital Hedge Fund, Bitcoin Ecosystem Fund (venture), and UTXO Preferred Income LP (structured credit). Subsidiary of Nakamoto Inc. (NASDAQ: NAKA). Founder inbound is contact@utxo.management. Distinct from generalist crypto funds — every check is a Bitcoin-thesis check.",
    stage: "Seed → growth",
    focus: "Bitcoin · Lightning · mining · BTC-native finance",
    location: "United States",
    pitchUrl: "mailto:contact@utxo.management",
    tags: ["bitcoin", "lightning", "mining", "structured-credit"],
  },
  {
    name: "Lowercarbon Capital",
    organization: "Lowercarbon Capital",
    organizationUrl: "https://lowercarbon.com/",
    description:
      "Chris and Crystal Sacca's climate fund — backs companies cutting CO2, removing carbon, or adapting to climate change. Portfolio crosses heavily into AI-adjacent territory: Crusoe (low-emissions GPU compute), Commonwealth Fusion, Antora (thermal storage), Heart Aerospace (electric aviation). Public 'Drop Us a Line' form is the founder inbound; a separate /building/ surface targets technical founders specifically. Surfaced here for AI-compute and robotics-adjacent climate builders.",
    stage: "Seed → growth",
    focus: "Climate · AI compute · fusion · industrial decarbonization",
    location: "San Francisco, CA",
    pitchUrl: "https://lowercarbon.com/drop-us-a-line/",
    tags: ["climate", "ai-compute", "fusion", "industrial", "frontier-tech"],
  },
  {
    name: "Folius Ventures",
    organization: "Folius Ventures",
    organizationUrl: "https://folius.ventures/",
    description:
      "APAC + China-focused web3 venture firm with explicit consumer-crypto and AI overlap (a 'Venture Partner - 2C & AI' role anchors that thesis). Maintains substantial non-public exposure across web3 protocols and consumer apps. Founder inbound is lfg@folius.ventures; the firm openly invites deal flow there.",
    stage: "Pre-seed → Series A",
    focus: "Web3 · consumer crypto · APAC · AI x crypto",
    location: "APAC · China",
    pitchUrl: "mailto:lfg@folius.ventures",
    tags: ["crypto", "web3", "consumer", "ai", "apac"],
  },
  {
    name: "Antler",
    organization: "Antler",
    organizationUrl: "https://www.antler.co/",
    description:
      "Global inception-stage program backing founders 'from day zero' across 30 locations spanning Asia-Pacific, Europe, the Americas, the Middle East, and Africa. Aggressively positioned as 'the world's fastest growing portfolio of AI companies.' Provides capital, residency-style cohort programming, and a global founder network; new cohorts open continuously per location. Public Apply portal on the homepage with per-location intake.",
    stage: "Inception · Pre-seed",
    focus: "AI · generalist · global founders",
    location: "Global · 30 locations",
    pitchUrl: "https://www.antler.co/apply",
    tags: ["pre-seed", "ai", "global", "inception", "cohort"],
  },
  {
    name: "Forerunner Ventures",
    organization: "Forerunner Ventures",
    organizationUrl: "https://forerunnerventures.com/",
    description:
      "Kirsten Green's consumer-and-AI early-stage firm — invests when 'conviction matters more than consensus.' Thesis straddles AI infrastructure and AI-applied to health, money, work, learning, and connection. Notable portfolio: Glossier, Chime, Hims & Hers, Oura, Speechify. Founder inbound is info@forerunnerventures.com; the firm explicitly welcomes early-conviction cold outreach.",
    stage: "Pre-seed → Series A",
    focus: "AI · consumer · health · fintech · applied AI",
    location: "San Francisco, CA",
    pitchUrl: "mailto:info@forerunnerventures.com",
    tags: ["pre-seed", "seed", "ai", "consumer", "health"],
  },
  {
    name: "Speedrun (a16z)",
    organization: "Andreessen Horowitz",
    organizationUrl: "https://a16z.com/",
    description:
      "a16z's pre-seed/seed accelerator launched 2023. Up to $1M in funding plus $7M in services credits per company. 250+ startups across $200M+ deployed. Open globally. Includes hands-on support across sales, marketing, hiring, visa, and fundraising plus a demo day and a global founder community. Cohort-based — application opens batch-by-batch on the linked URL. Originally games/entertainment-themed but explicitly broadened to all sectors.",
    stage: "Pre-seed → Seed",
    checkSize: "Up to $1M + $7M in credits",
    focus: "Generalist · velocity-first · global founders",
    location: "Global · SF demo day",
    pitchUrl: "https://speedrun006.a16z.com/ya",
    tags: ["pre-seed", "seed", "ai", "games", "consumer", "cohort"],
  },
  {
    name: "MaC Venture Capital",
    organization: "MaC Venture Capital",
    organizationUrl: "https://macventurecapital.com/",
    description:
      "Seed-stage firm led by Marlon Nichols and Adrian Fenty (with Michael Palank and Charles D. King) — backs founders across aerospace, fintech, fashion-tech, food robotics, and mobility. Conviction-first thesis with strong operator-network value beyond capital. Public 'Connect' surface is the founder inbound; LA-anchored with national mandate. Fits robotics-broad scope through food-robotics and mobility coverage.",
    stage: "Seed",
    focus: "Aerospace · fintech · food robotics · mobility · culture",
    location: "Los Angeles, CA",
    pitchUrl: "https://macventurecapital.com/",
    tags: ["seed", "aerospace", "robotics", "mobility", "fintech"],
  },
  {
    name: "Accel Starters Scout Program",
    organization: "Accel",
    organizationUrl: "https://www.accel.com/",
    description:
      "Scout program for Accel's US and European franchises — each scout gets a $200k allocation to deploy over 2–3 years in $20k average checks, with full autonomy and no quota. Differentiator vs. other scout networks: Accel publishes its scout list publicly and explicitly invites founders to pitch scouts directly. Scout-sourced deals run a light memo through Accel before wiring; every scout deal is auto-evaluated for follow-on by the main fund. Operator-tilted scout selection (repeat founders, scale-up leads) means scouts are typically a strong product-market-fit signal.",
    stage: "Pre-seed → Seed",
    checkSize: "~$20k per scout check · ~$200k per scout allocation",
    focus: "Generalist · operator-led · US + Europe",
    location: "San Francisco · London · Bengaluru",
    pitchUrl: "https://www.accel.com/",
    tags: ["scout-program", "pre-seed", "seed", "europe", "generalist"],
  },
  {
    name: "Sequoia Scout Program",
    organization: "Sequoia Capital",
    organizationUrl: "https://www.sequoiacap.com/",
    description:
      "The original VC scout program, launched 2009 — Jason Calacanis's scout-era check into Uber is the founding case. Active across US and Europe. Scouts write $25k–$100k per investment with allocations of $100k–$1M annually; cumulatively, scout-backed companies have raised ~$6B in follow-on. Scout selection is invitation-only — there is no founder-side application. Founder utility: identify Sequoia scouts in your network, pitch them as you would any angel, and a backed deal puts you in front of Sequoia partners for term-sheet input and follow-on evaluation.",
    stage: "Pre-seed → Seed",
    checkSize: "$25k–$100k per scout check",
    focus: "Generalist · scout-routed",
    location: "Global · US + Europe",
    pitchUrl: "https://www.sequoiacap.com/",
    tags: ["scout-program", "pre-seed", "seed", "generalist", "angel-routed"],
  },
  {
    name: "a16z Scout Program",
    organization: "Andreessen Horowitz",
    organizationUrl: "https://a16z.com/",
    description:
      "Scout program covering a16z's full sector stack (consumer, enterprise, crypto, AI, bio, fintech). Each scout writes $10k–$25k per deal across ~8 deals/year (~$200k deployed over 2–3 years). At least 21 active scouts in Europe alone as of mid-2025. Scout selection is invite-only and tilted toward active angels who are already in deal flow. Every scout deal is auto-routed to a16z's main fund for follow-on review. Founder path: find a scout in your network (LinkedIn / portfolio mentions / Superscout directory), pitch directly.",
    stage: "Pre-seed → Seed",
    checkSize: "$10k–$25k per scout check",
    focus: "Generalist · consumer · enterprise · crypto · AI · bio · fintech",
    location: "Global · heavy SF + Europe",
    pitchUrl: "https://a16z.com/",
    tags: ["scout-program", "pre-seed", "ai", "crypto", "consumer", "enterprise"],
  },
  {
    name: "500 Global Scout Network",
    organization: "500 Global",
    organizationUrl: "https://500.co/",
    description:
      "Geographically distributed scout network supporting 500 Global's strategy of catching pre-seed deals conventional VCs miss. Includes regional sub-programs — SEA Deal Scouts and a LatAm CVC Scout Network among them. Scouts engage part-time and remotely, paid via carried interest. Selection is by invitation/referral only; rolling cadence. Founder utility: 500's portfolio spans 2,500+ companies across 77 countries, so the scout network reaches into ecosystems where many top-tier US scout programs don't have presence — particularly SEA, LatAm, MENA.",
    stage: "Pre-seed",
    focus: "Emerging markets · SEA · LatAm · MENA · global",
    location: "Global · 77 countries",
    pitchUrl: "https://500.co/",
    tags: ["scout-program", "pre-seed", "emerging-markets", "sea", "latam", "mena"],
  },
  {
    name: "Slow Ventures",
    organization: "Slow Ventures",
    organizationUrl: "https://slow.co/",
    description:
      "Generalist early-stage firm (~$770M AUM, ~$1B+ deployed). Invests across security, fintech, SaaS, crypto, consumer, healthcare, and the creator economy. Founded by Dave Morin (Facebook alum) in 2009; currently led by GP Sam Lessin (ex-Facebook product, The Information columnist) and MD Kevin Colleran. Public Seed Funding Application form is the cold-inbound path; team responds within a few weeks. Warm intros preferred but not required.",
    stage: "Pre-seed → Seed",
    focus: "Generalist — fintech, SaaS, crypto, consumer, creator economy",
    location: "San Francisco · Boston · New York",
    pitchUrl: "https://slow.co/contact/",
    decisionWindow: "Response in ~few weeks",
    tags: ["generalist", "pre-seed", "seed", "fintech", "crypto", "creator-economy"],
  },

  // === AI-native funds + missing crypto majors (added 2026-05-17, curated 2026-05-17) ===
  // Removed per "remove them if they don't want to be contacted" rule (2026-05-17):
  // OpenAI Startup Fund, Greylock, Polychain, Paradigm, a16z (multi-stage), Lightspeed
  // — all invite/partner-mediated with no real cold-inbound intake path.
  {
    name: "Conviction",
    organization: "Conviction Partners",
    organizationUrl: "https://www.conviction.com/",
    description:
      "Sarah Guo's AI-native venture firm — explicit thesis is 'Software 3.0' (apps that manipulate foundation models). $1M–$25M checks, often first money in. 47 portfolio companies, 8 unicorns including Mistral AI, Harvey, OpenEvidence. Recent investments: Fractile, Astrocade.",
    stage: "Seed → Series A",
    checkSize: "$1M–$25M",
    location: "San Francisco",
    focus: "AI-native applications and infra",
    pitchUrl: "https://www.conviction.com/",
    tags: ["conviction", "ai", "software-3", "sf"],
  },
  {
    name: "Lux Capital",
    organization: "Lux Capital",
    organizationUrl: "https://www.luxcapital.com/",
    description:
      "Deeptech-focused venture firm with major AI / robotics / frontier-science thesis. Portfolio includes Anduril, Saronic, Hadrian, Figure, Genesis Therapeutics. Backs founders applying ML to physics-rich domains: defense, manufacturing, drug discovery, robotics, space.",
    stage: "Seed → Growth",
    checkSize: "$1M–$25M+",
    location: "New York / Menlo Park",
    focus: "Deeptech, robotics, AI for physical world",
    pitchUrl: "https://www.luxcapital.com/contact",
    tags: ["lux", "deeptech", "robotics", "ai", "frontier"],
  },
  {
    name: "Felicis",
    organization: "Felicis Ventures",
    organizationUrl: "https://www.felicis.com/",
    description:
      "Multi-stage venture firm by Aydin Senkut. Heavy AI focus — portfolio includes Runway, Suno, Poolside, Hippocratic AI, Glean, Adept. Writes leading checks from seed through growth.",
    stage: "Seed → Growth",
    checkSize: "$1M–$30M+",
    location: "Menlo Park",
    focus: "AI, dev tools, infrastructure, consumer",
    pitchUrl: "https://www.felicis.com/about/contact",
    tags: ["felicis", "ai", "multi-stage"],
  },
  {
    name: "Coinbase Ventures",
    organization: "Coinbase",
    organizationUrl: "https://www.coinbase.com/ventures",
    description:
      "Coinbase's strategic venture arm. 400+ portfolio companies across crypto infra, DeFi, consumer, fintech. Light-touch check writer (typically follows specialist leads) but ecosystem access via Coinbase is the prize.",
    stage: "Seed → Series B",
    checkSize: "$500k–$5M+",
    location: "Remote / SF",
    focus: "Crypto + Web3 across the stack",
    pitchUrl: "https://www.coinbase.com/ventures",
    tags: ["coinbase", "crypto", "ventures", "strategic"],
  },
  {
    name: "Robot Ventures",
    organization: "Robot Ventures",
    organizationUrl: "https://www.robot.ventures/",
    description:
      "Robert Leshner (Compound founder) + Tarun Chitra's pre-seed crypto fund. Tiny check, very early. Known for fast yes/no calls and high-signal portfolio across DeFi, infra, stablecoins.",
    stage: "Pre-seed → Seed",
    checkSize: "$25k–$500k",
    location: "Remote",
    focus: "Crypto pre-seed",
    pitchUrl: "https://www.robot.ventures/",
    decisionWindow: "Fast — days, not weeks",
    tags: ["robot", "crypto", "pre-seed", "fast"],
  },

  // === Crypto VCs with confirmed published cold-inbound (added 2026-05-19) ===
  {
    name: "Hack VC",
    organization: "Hack VC",
    organizationUrl: "https://hack.vc/",
    description:
      "One of the earliest institutional crypto + AI VC firms (founded 2014). Co-leads with Polychain on multiple Bitcoin L2 rounds (Babylon, Mezo). Runs hack.labs() as internal R&D. Cold inbound goes to contact@hack.vc — they explicitly welcome founder cold pitches per their OpenVC listing. Stage-agnostic from idea through global scale.",
    stage: "Pre-seed → Growth",
    location: "Palo Alto, CA",
    focus: "Crypto + AI — infra, DeFi, BTC L2",
    pitchUrl: "mailto:contact@hack.vc",
    tags: ["hack-vc", "crypto", "ai", "bitcoin-l2", "founder-friendly"],
  },
  {
    name: "Bain Capital Crypto",
    organization: "Bain Capital Crypto",
    organizationUrl: "https://baincapitalcrypto.com/",
    description:
      "Bain Capital's dedicated crypto fund — backs renegades and pioneers building open-internet infrastructure. Fund II actively deploying as of 2026. Public investor inbound at investors@baincapitalcrypto.com — explicitly listed on their contact page as the founder pitch channel.",
    stage: "Seed → Series B",
    location: "Boston · New York · SF",
    focus: "Crypto infra, open-internet protocols",
    pitchUrl: "mailto:investors@baincapitalcrypto.com",
    tags: ["bain", "crypto", "infra", "institutional"],
  },
  {
    name: "Ten31",
    organization: "Ten31",
    organizationUrl: "https://www.ten31.vc/",
    description:
      "Bitcoin-only venture firm. $100M+ deployed to date across Bitcoin infrastructure and Freedom Tech — Lightning Network apps, BTC custody, mining hardware, and Bitcoin-native financial primitives. Fund III closed at $37.5M in 2025. Offices in New York, Austin, Nashville. Cold inbound via the contact form on ten31.vc.",
    stage: "Seed → Series A",
    location: "New York · Austin · Nashville",
    focus: "Bitcoin infrastructure + Freedom Tech",
    pitchUrl: "https://www.ten31.vc/",
    tags: ["ten31", "bitcoin", "lightning", "freedom-tech"],
  },
  {
    name: "Castle Island Ventures",
    organization: "Castle Island Ventures",
    organizationUrl: "https://castleisland.vc/",
    description:
      "Early-stage public-blockchain VC founded by Nic Carter and Matt Walsh. ~$250M AUM as of Jan 2026; 76+ portfolio companies with 9 new investments in the trailing 12 months. Heavy Bitcoin + stablecoin/payments-infra concentration. Cold inbound via castleisland.vc contact.",
    stage: "Seed → Series A",
    location: "Boston, MA",
    focus: "Bitcoin · stablecoins · public-blockchain infra",
    pitchUrl: "https://castleisland.vc/",
    tags: ["castle-island", "bitcoin", "stablecoins", "infra"],
  },
  {
    name: "LvlUp Ventures — First Check Fund",
    organization: "LvlUp Ventures",
    organizationUrl: "https://www.lvlup.vc/",
    description:
      "Idea-stage / pre-formation rolling fund. Writes $1k–$10k cash checks plus a ~$10M perk stack (cloud credits, tooling, network access) as a founder's first institutional capital. Industry-agnostic and global — no entity required, no data room required. Stated goal of 1,000 investments in 2026; LvlUp claims Pitchbook's #7 Most Active VC Firm Globally ranking on the strength of that volume. Public funding-application portal; decision in under a week. Pairs with LvlUp's accelerator and direct-investment vehicles for follow-on.",
    stage: "Idea → Pre-seed",
    checkSize: "$1k–$10k cash + ~$10M in perks",
    focus: "Generalist · idea-stage first money",
    pitchUrl: "https://www.lvlup.vc/apply/funding-application",
    decisionWindow: "Decision in <1 week",
    tags: ["lvlup", "first-check", "idea-stage", "pre-seed", "generalist", "perks"],
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
