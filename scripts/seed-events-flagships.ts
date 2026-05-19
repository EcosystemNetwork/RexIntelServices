/**
 * Run with: npx tsx scripts/seed-events-flagships.ts
 *
 * Seeds flagship conferences across web3 + AI/robotics — the "if a builder
 * picks one trip per quarter, it's this one" tier. Complements the
 * ETHGlobal/ETHConf/SaaStr seeds, which cover the Ethereum-week and
 * agentic-summit pockets respectively. Idempotent: matched by
 * payload->>'name', so re-running updates existing rows in place.
 *
 * Curation: every entry has a verified URL and a 2026/2027 edition that has
 * been publicly announced (no extrapolated dates). Sources cited inline in
 * each description's first line.
 *
 * Date handling: where the venue publishes local times, we pin to a
 * 12:00 local-noon equivalent in UTC so the displayed calendar date stays
 * stable in most timezones (same convention as seed-events-ethglobal.ts).
 */
import "dotenv/config";
import { and, eq, sql } from "drizzle-orm";
import { db, submissions } from "../src/lib/db";
import type { EventPayload } from "../src/lib/db/schema";

type SeedInput = {
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  city?: string;
  country?: string;
  venue?: string;
  url: string;
  description: string;
  tags?: string[];
  priceTier?: "free" | "paid" | "invite";
  eventType?: EventPayload["eventType"];
};

const inputs: SeedInput[] = [
  // ===========================================================
  // === WEB3 FLAGSHIPS                                      ===
  // ===========================================================

  // Blockworks / Bankless — DeFi-leaning conference + hackathon (hackathon
  // already seeded in seed-hackathons.ts; this is the main-event conf).
  {
    name: "Permissionless IV 2026",
    startDate: "2026-06-24",
    endDate: "2026-06-26",
    city: "Brooklyn",
    country: "United States",
    venue: "Industry City",
    url: "https://blockworks.com/event/permissionless",
    description:
      "Blockworks + Bankless's annual DeFi conference. Industry City, Brooklyn. 3 days of stages on DeFi, on-chain finance, RWAs, prediction markets — kicked off the prior weekend by the Permissionless IV Hackathon ($100K+ bounties).",
    tags: ["defi", "ethereum", "rwa", "blockworks", "bankless"],
    priceTier: "paid",
    eventType: "conference",
  },

  // Ethereum Foundation flagship — fully announced for 2026.
  {
    name: "Devcon 8 — Mumbai 2026",
    startDate: "2026-11-03",
    endDate: "2026-11-06",
    city: "Mumbai",
    country: "India",
    venue: "Jio World Centre",
    url: "https://devcon.org/",
    description:
      "Ethereum Foundation's flagship developer conference — first time in India. 4 days at Jio World Centre, Mumbai. Co-located with ETHGlobal Mumbai (Nov 6–8) and the broader Devconnect-style Mumbai builder week. The most important Ethereum gathering of the year.",
    tags: ["ethereum", "ef", "devcon", "protocol"],
    priceTier: "paid",
    eventType: "conference",
  },

  // Asia's premier crypto week, hub of side-event ecosystem in Q3.
  {
    name: "Korea Blockchain Week 2026",
    startDate: "2026-09-29",
    endDate: "2026-10-01",
    city: "Seoul",
    country: "South Korea",
    url: "https://koreablockchainweek.com/",
    description:
      "Asia's premier Web3 festival. IMPACT main conference plus the largest builder/founder side-event ecosystem in APAC — hundreds of hackathons, parties, pitch days and meetups. Direct on-ramp to Korean and broader Asian liquidity.",
    tags: ["asia", "korea", "kbw"],
    priceTier: "paid",
    eventType: "conference",
  },

  // The other half of "Asia Crypto Week" — sits adjacent to KBW in the calendar.
  {
    name: "TOKEN2049 Singapore 2026",
    startDate: "2026-10-07",
    endDate: "2026-10-08",
    city: "Singapore",
    venue: "Marina Bay Sands",
    url: "https://www.token2049.com/singapore",
    description:
      "Crypto's premier industry conference. Two days at Marina Bay Sands turn into a five-floor pop-up city across 1,000+ unofficial parties, workshops and side events. Hackathons (TOKEN2049 Origins, HYPE Singapore) attach for builders.",
    tags: ["asia", "singapore", "token2049"],
    priceTier: "paid",
    eventType: "conference",
  },

  // Japan flagship — bridges Asia liquidity and Japanese regulatory access.
  {
    name: "WebX Tokyo 2026",
    startDate: "2026-07-13",
    endDate: "2026-07-14",
    city: "Tokyo",
    country: "Japan",
    venue: "The Prince Park Tower Tokyo",
    url: "https://webx-asia.com/",
    description:
      "Asia's largest Web3 conference operated by CoinPost. 15,000+ attendees, government track (past speakers include Japanese PM, Binance CEO, Justin Sun). Coverage spans crypto, blockchain infra, NFTs, DeFi, and Web3×AI.",
    tags: ["asia", "japan", "tokyo", "webx"],
    priceTier: "paid",
    eventType: "conference",
  },

  // Solana Foundation flagship — moves to London for 2026.
  {
    name: "Solana Breakpoint 2026",
    startDate: "2026-11-15",
    endDate: "2026-11-17",
    city: "London",
    country: "United Kingdom",
    venue: "Olympia London",
    url: "https://solana.com/breakpoint",
    description:
      "Solana Foundation's flagship annual conference. First-ever European edition at Olympia London — the year's gathering point for Solana founders, protocol teams, and ecosystem capital (Multicoin, Anagram, Solana Ventures).",
    tags: ["solana", "europe", "london", "breakpoint"],
    priceTier: "paid",
    eventType: "conference",
  },

  // ===========================================================
  // === AI / ROBOTICS FLAGSHIPS                             ===
  // ===========================================================

  // The single most important AI builder conference of the year.
  {
    name: "AI Engineer World's Fair 2026",
    startDate: "2026-06-29",
    endDate: "2026-07-02",
    city: "San Francisco",
    country: "United States",
    venue: "San Francisco Marriott Marquis",
    url: "https://www.ai.engineer/worldsfair",
    description:
      "The world's largest technical AI conference — 29 tracks, 300 speakers, 100 expo partners, 6,000+ AI engineers, founders and VPs of AI. Practitioners from OpenAI, Anthropic, Google DeepMind, Meta, Cursor, Netflix on stage. 4th year in SF.",
    tags: ["ai", "ai-engineering", "production-ai", "sf"],
    priceTier: "paid",
    eventType: "conference",
  },

  // East-coast AI builder counterpart to AI Engineer SF — one-day format.
  {
    name: "Agentic AI Summit NYC 2026",
    startDate: "2026-06-04",
    endDate: "2026-06-04",
    city: "New York",
    country: "United States",
    url: "https://www.agentic-summit.ai/",
    description:
      "Engineering-first one-day summit for builders shipping agentic AI systems in production. 400+ peers from leading labs and applied-AI startups across 15+ industries — for AI engineers, researchers, and technical founders.",
    tags: ["ai", "agents", "agentic", "nyc"],
    priceTier: "paid",
    eventType: "conference",
  },

  // Top-tier robotics academic conference.
  {
    name: "RSS 2026 — Robotics: Science and Systems",
    startDate: "2026-07-13",
    endDate: "2026-07-17",
    city: "Sydney",
    country: "Australia",
    venue: "University of Technology Sydney",
    url: "https://roboticsconference.org/",
    description:
      "22nd Robotics: Science and Systems — one of the top-tier robotics research venues alongside CoRL and ICRA. Foundational research on manipulation, learning, planning, and embodied systems.",
    tags: ["robotics", "research", "academic", "rss"],
    priceTier: "paid",
    eventType: "conference",
  },

  // ML's annual academic flagship.
  {
    name: "ICML 2026 — International Conference on Machine Learning",
    startDate: "2026-07-06",
    endDate: "2026-07-11",
    city: "Seoul",
    country: "South Korea",
    venue: "COEX Convention & Exhibition Center",
    url: "https://icml.cc/Conferences/2026",
    description:
      "Top-tier annual machine-learning research conference. Jul 6 Expo/Tutorial Day, Jul 7–9 Main Conference, Jul 10–11 Workshops. The largest single gathering of ML researchers outside NeurIPS.",
    tags: ["ai", "ml", "research", "academic", "icml"],
    priceTier: "paid",
    eventType: "conference",
  },

  // Language-modeling-specific venue, fast-growing alternative to NeurIPS.
  {
    name: "COLM 2026 — Conference on Language Modeling",
    startDate: "2026-10-06",
    endDate: "2026-10-09",
    city: "San Francisco",
    country: "United States",
    venue: "Hilton San Francisco Union Square",
    url: "https://colmweb.org/",
    description:
      "Conference on Language Modeling — single-track, language-model-focused academic conference. 3 days of invited talks, oral presentations, and posters, capped by a workshop day. Premier venue for LM research outside the general ML conferences.",
    tags: ["ai", "llms", "language-models", "colm", "research"],
    priceTier: "paid",
    eventType: "conference",
  },

  // YC's selective 2-day founder bootcamp — invite-only by application,
  // flight stipend, $25K OpenAI credits for selected attendees.
  {
    name: "YC Startup School 2026",
    startDate: "2026-07-25",
    endDate: "2026-07-26",
    city: "San Francisco",
    country: "United States",
    url: "https://events.ycombinator.com/startup-school-2026",
    description:
      "Y Combinator's hand-selected 2-day in-person founder bootcamp at YC HQ. Speakers confirmed: Jensen Huang (NVIDIA), Sam Altman (OpenAI), Jeff Dean (Google DeepMind), YC partners — plus live hardware + robotics demos. Selected attendees get $25,000 in OpenAI credits, up to $500 flight reimbursement, small-group sessions with speakers. Application-gated (applications opened earlier in 2026 via events.ycombinator.com/startup-school-2026). Free if accepted.",
    tags: ["yc", "y-combinator", "startup-school", "founders", "ai", "robotics", "sf", "invite-only"],
    priceTier: "invite",
    eventType: "conference",
  },

  // East-coast edition of AI Engineer (the builder, not academic, track).
  {
    name: "AI Engineer NYC 2026",
    startDate: "2026-10-12",
    endDate: "2026-10-14",
    city: "New York",
    country: "United States",
    url: "https://www.ai.engineer/nyc",
    description:
      "AI Engineer's flagship technical NYC conference. Practitioners from Google DeepMind, Anthropic, Cursor, Netflix, OpenAI, Meta. For AI engineers, ML engineers, VPs of AI, CTOs, technical founders, and anyone shipping production AI systems.",
    tags: ["ai", "ai-engineering", "production-ai", "nyc"],
    priceTier: "paid",
    eventType: "conference",
  },

  // Top-tier robotic learning conference (paper deadlines May 29, 2026).
  {
    name: "CoRL 2026 — Conference on Robot Learning",
    startDate: "2026-11-09",
    endDate: "2026-11-12",
    city: "Austin",
    country: "United States",
    venue: "JW Marriott Austin",
    url: "https://www.corl.org/",
    description:
      "Premier annual conference at the intersection of robotics and machine learning. Workshop day Nov 9, main conference Nov 10–12. Where humanoids, manipulation, and end-to-end learned policies are debated.",
    tags: ["robotics", "robot-learning", "research", "corl"],
    priceTier: "paid",
    eventType: "conference",
  },

  // The biggest AI research conference of the year — global multi-site format.
  {
    name: "NeurIPS 2026 — Sydney (Main)",
    startDate: "2026-12-06",
    endDate: "2026-12-12",
    city: "Sydney",
    country: "Australia",
    venue: "International Convention Centre",
    url: "https://neurips.cc/Conferences/2026",
    description:
      "Neural Information Processing Systems 2026 — the largest AI/ML research conference globally. Main event in Sydney ICC. Official satellite events also run in Atlanta (Dec 8–13) and Paris (Dec 9–13) for travel-constrained attendees.",
    tags: ["ai", "ml", "research", "academic", "neurips"],
    priceTier: "paid",
    eventType: "conference",
  },

  // Enterprise-focused AI summit, year-end NYC.
  {
    name: "The AI Summit New York 2026",
    startDate: "2026-12-09",
    endDate: "2026-12-10",
    city: "New York",
    country: "United States",
    venue: "Javits Center",
    url: "https://newyork.theaisummit.com/",
    description:
      "Enterprise-grade AI summit at Javits Center, NYC. Two days of enterprise solutions, interactive workshops, live demos and networking — the corporate counterpart to AI Engineer NYC and the AI Engineer World's Fair.",
    tags: ["ai", "enterprise", "nyc"],
    priceTier: "paid",
    eventType: "conference",
  },

  // ===========================================================
  // === DECENTRALIZED / CITY-WIDE FLAGSHIPS                 ===
  // ===========================================================

  // a16z-presented decentralized conferences. Hundreds of independently-hosted
  // side events across the city for the week — hackathons, panels, founder
  // dinners, happy hours. Free to attend; submissions reviewed by the a16z team.
  {
    name: "Boston Tech Week 2026",
    startDate: "2026-05-26",
    endDate: "2026-05-31",
    city: "Boston",
    country: "United States",
    url: "https://www.tech-week.com/boston",
    description:
      "Inaugural Boston edition of a16z-presented Tech Week — a decentralized, citywide conference with hundreds of independently-hosted side events: hackathons, panels, founder dinners, happy hours. Free to attend; events open to anyone via the public calendar. Tracks: AI + Infra, Hackathons, Fintech, Students, Engineers, Founders, GTM, Investors.",
    tags: ["a16z", "techweek", "boston", "ai", "founders", "decentralized"],
    priceTier: "free",
    eventType: "other",
  },
  {
    name: "NYC Tech Week 2026",
    startDate: "2026-06-01",
    endDate: "2026-06-07",
    city: "New York",
    country: "United States",
    url: "https://www.tech-week.com/nyc",
    description:
      "Fourth annual NYC edition of a16z-presented Tech Week — a decentralized, citywide conference. Prior year saw 1,000+ side events from NYC startups, VCs, and communities. Tracks: AI + Infra, Hackathons, Fintech, Students, Engineers, Founders, GTM, Investors. Side-event calendar at tech-week.com/calendar; hosts can submit at tech-week.com/host. Platinum sponsors: a16z, Fenwick, HSBC, IBM.",
    tags: ["a16z", "techweek", "nyc", "ai", "fintech", "founders", "decentralized"],
    priceTier: "free",
    eventType: "other",
  },
  {
    name: "SF Tech Week 2026",
    startDate: "2026-10-05",
    endDate: "2026-10-11",
    city: "San Francisco",
    country: "United States",
    url: "https://www.tech-week.com/sf",
    description:
      "San Francisco edition of a16z-presented Tech Week — decentralized citywide conference with hundreds of independently-hosted side events across AI, founders, investors, fintech, engineers tracks.",
    tags: ["a16z", "techweek", "sf", "ai", "founders", "decentralized"],
    priceTier: "free",
    eventType: "other",
  },
  {
    name: "LA Tech Week 2026",
    startDate: "2026-10-12",
    endDate: "2026-10-18",
    city: "Los Angeles",
    country: "United States",
    url: "https://www.tech-week.com/la",
    description:
      "Los Angeles edition of a16z-presented Tech Week — decentralized citywide conference. Side events span AI, consumer, gaming, founders, investors, fintech.",
    tags: ["a16z", "techweek", "la", "ai", "consumer", "decentralized"],
    priceTier: "free",
    eventType: "other",
  },

  // ===========================================================
  // === REGIONAL SOLANA SUMMITS — 2026 TOUR                 ===
  // ===========================================================

  // Superteam Kazakhstan — RWA-themed Solana flagship in Central Asia.
  {
    name: "Solana Summit Kazakhstan 2026",
    startDate: "2026-05-22",
    endDate: "2026-05-22",
    city: "Almaty",
    country: "Kazakhstan",
    venue: "Swissotel Wellness Resort Alatau",
    url: "https://luma.com/solana-summit-kazakhstan",
    description:
      "Flagship Web3 conference in Central Asia and the EAEU, organised by Superteam Kazakhstan (regional Solana ecosystem rep). Theme: tokenization of real-world assets. Founder talks, fireside chats, live pitches, coding stations, and ecosystem-leader keynotes. Approval-required Luma registration with token-ownership verification.",
    tags: ["solana", "kazakhstan", "central-asia", "rwa", "superteam", "almaty"],
    priceTier: "invite",
    eventType: "conference",
  },

  // Solana Summit DACH flagship — Berlin.
  {
    name: "Solana Summit Germany 2026",
    startDate: "2026-06-13",
    endDate: "2026-06-13",
    city: "Berlin",
    country: "Germany",
    url: "https://luma.com/solanasummitgermany",
    description:
      "Single-day Berlin edition of the Solana Summit series. Regional gathering of Solana builders, validators, and ecosystem partners across the DACH region. Programming spans DeFi, payments, consumer onchain, and Berlin's growing onchain founder community.",
    tags: ["solana", "germany", "berlin", "europe", "dach"],
    priceTier: "paid",
    eventType: "conference",
  },

  // Superteam Serbia — Balkans Solana flagship.
  {
    name: "Solana Summit Serbia 2026",
    startDate: "2026-08-26",
    endDate: "2026-08-27",
    city: "Belgrade",
    country: "Serbia",
    url: "https://luma.com/solana-summit-serbia",
    description:
      "Two-day Solana Summit edition in Belgrade — Balkan-region Solana developer + founder gathering programmed by Superteam Serbia. Tracks span DeFi, consumer onchain, SVM tooling, and emerging-market payments.",
    tags: ["solana", "serbia", "belgrade", "balkans", "europe", "superteam"],
    priceTier: "paid",
    eventType: "conference",
  },

  // Solana Hacker House — pre-Breakpoint shipping camp, returns after a multi-year hiatus.
  {
    name: "Solana Hacker House London 2026",
    startDate: "2026-10-31",
    endDate: "2026-11-12",
    city: "London",
    country: "United Kingdom",
    url: "https://luma.com/london-hacker-house",
    description:
      "13-day in-person hacker house in London immediately preceding Breakpoint 2026 (Nov 15–17). Workshops, mentorship, side rooms for serious shipping, and a demo day. The Solana Hacker House format returns after a multi-year hiatus, slotting into the pre-flagship window.",
    tags: ["solana", "london", "hacker-house", "uk", "breakpoint"],
    priceTier: "invite",
    eventType: "hackathon",
  },

  // ===========================================================
  // === ARBITRUM OPEN HOUSE 2026 — LONDON LEG               ===
  // ===========================================================

  // Arbitrum Foundation's 4-city builder program — NYC done, London live, Singapore TBA,
  // Dubai postponed. London leg has its own $415K prize pool out of the $1.8M global total.
  {
    name: "Arbitrum Open House London 2026",
    startDate: "2026-05-25",
    endDate: "2026-06-28",
    city: "London",
    country: "United Kingdom",
    url: "https://openhouse.arbitrum.io/",
    description:
      "Arbitrum's flagship 2026 builder program — 3-week online Buildathon (May 25 – Jun 14) followed by a 3-day IRL Founder House in London (Jun 25–28). $415K in prizes and grants for the London leg of the global 4-city program ($1.8M total across NYC, London, Singapore, Dubai). Technical workshops, product sessions, dedicated mentorship hours, live pitches, and continued post-program support from the Arbitrum Foundation + Offchain Labs.",
    tags: ["arbitrum", "london", "buildathon", "founder-house", "l2", "open-house"],
    priceTier: "paid",
    eventType: "hackathon",
  },

  // ===========================================================
  // === HARD-TECH / DEEP-TECH SHOWCASES                     ===
  // ===========================================================

  // South Park Commons India + ARTPARK — hard-tech founder showcase.
  // URGENT: applications close 2026-05-20, event 2026-05-30 to 2026-05-31.
  {
    name: "SPC Curiosity 2026 — Building in Hard Mode",
    startDate: "2026-05-30",
    endDate: "2026-05-31",
    city: "Bengaluru",
    country: "India",
    url: "https://www.southparkcommons.com/curiosity",
    description:
      "Applications close Wed May 20, 2026. South Park Commons India (powered by ARTPARK) hard-tech showcase. Tracks: Aerospace & Space, Defense & Counter-Systems, Robotics & Autonomous Systems, Photonics/Optics/Semiconductors, Climate & Energy, Biotech & Medical, Physical AI. Day 1 closed prep; Day 2 public science-fair-style demo with 15–20 selected teams. ₹1.25Cr+ in winner grants plus $75K in credits. No company registration or SPC membership required — recent grads, early-stage cos, research labs and tinkerers all welcome.",
    tags: ["spc", "hard-tech", "physical-ai", "robotics", "deep-tech", "india", "bengaluru", "artpark"],
    priceTier: "free",
    eventType: "other",
  },

  // Switzerland's national startup-competition award night — EPFL venue,
  // CHF 150K + CHF 50K Apertus AI spotlight + CHF 10K audience prize.
  {
    name: ">>venture>> Award Ceremony 2026 — Lausanne",
    startDate: "2026-06-15",
    endDate: "2026-06-15",
    city: "Ecublens",
    country: "Switzerland",
    venue: "SwissTech Convention Center",
    url: "https://www.eventbrite.com/e/2026-venture-award-ceremony-tickets-1982421621435",
    description:
      "Switzerland's leading startup competition awards ceremony at EPFL's SwissTech Convention Center (Mon Jun 15, 18:30–20:00 CEST). Six category winners (Business & Finance, Consumer Solutions, Industrials & Engineering, Medtech & Healthcare, Pharma & Biotech, Social & Environmental Impact) compete on stage with a live audience vote. CHF 150K Grand Prize (non-dilutive) + CHF 50K Spotlight Award for best innovative use of Apertus (Switzerland's open-source LLM) + CHF 10K Audience Award. Apéro reception follows.",
    tags: ["switzerland", "epfl", "startup-competition", "apertus", "deep-tech", "europe"],
    priceTier: "free",
    eventType: "other",
  },
];

function toPayload(input: SeedInput): EventPayload {
  // 12:00 UTC start / 22:00 UTC end keeps the displayed calendar date stable
  // across timezones — same convention as the rest of the events seeds.
  const startsAt = `${input.startDate}T12:00:00Z`;
  const endsAt =
    input.endDate === input.startDate
      ? undefined
      : `${input.endDate}T22:00:00Z`;
  return {
    name: input.name,
    startsAt,
    endsAt,
    venue: input.venue,
    city: input.city,
    country: input.country,
    url: input.url,
    description: input.description,
    tags: input.tags,
    priceTier: input.priceTier ?? "paid",
    eventType: input.eventType ?? "conference",
  };
}

async function upsertEvent(input: SeedInput) {
  const payload = toPayload(input);
  const eventStartsAt = new Date(payload.startsAt);

  const existing = await db
    .select({ id: submissions.id, publicId: submissions.publicId })
    .from(submissions)
    .where(
      and(
        eq(submissions.type, "event"),
        sql`${submissions.payload}->>'name' = ${payload.name}`,
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    const [row] = await db
      .update(submissions)
      .set({
        payload,
        eventStartsAt,
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
      type: "event",
      status: "approved",
      payload,
      eventStartsAt,
      publishedAt: new Date(),
    })
    .returning({ publicId: submissions.publicId });
  return { action: "inserted" as const, publicId: row.publicId };
}

async function main() {
  let inserted = 0;
  let updated = 0;
  for (const input of inputs) {
    const r = await upsertEvent(input);
    if (r.action === "inserted") inserted++;
    else updated++;
    console.log(`  ${r.action.padEnd(8)} /events/${r.publicId}  ${input.name}`);
  }
  console.log(
    `\n✓ ${inputs.length} flagship events processed (${inserted} new, ${updated} updated).`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
