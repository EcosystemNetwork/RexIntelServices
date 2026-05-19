/**
 * Run with: npx tsx scripts/seed-events-nyc-tech-week-2026.ts
 *
 * Seeds curated side events from NYC Tech Week 2026 (Jun 1–7, a16z-presented).
 * NYC Tech Week 2026 has NO formal crypto track — the official tracks are
 * AI+Infra, Hackathons, Fintech, Students, Engineers, Founders, GTM,
 * Investors. So this seed selects the high-signal AI / hackathon / fintech
 * side events relevant to RexIntel's audience (web3 ∪ AI/robotics per the
 * broadens-all-lanes rule). The continuation into ETHConf (Jun 8–12) is
 * covered separately by scripts/seed-events-ethconf-2026-side.ts — together
 * they form RexIntel's unified NYC June 2026 index.
 *
 * Source: https://www.tech-week.com/calendar (track pages — AI+Infra,
 * Hackathons, Fintech). Individual event URLs are not exposed in track
 * listings, so each entry links to its host org or the track page.
 *
 * Curation bar: marquee host (frontier AI lab, top-tier VC, infra leader)
 * OR a real hackathon with cash/credits OR a unique cross-cut (AI × fintech,
 * AI × hardware, AI × bio). Skips generic happy hours, golf, and "office
 * hours" without a content hook. Idempotent: matched by payload->>'name'.
 *
 * Date convention: noon ET start, evening ET end mapped to UTC. Single-day
 * events get an explicit end time.
 */
import "dotenv/config";
import { and, eq, sql } from "drizzle-orm";
import { db, submissions } from "../src/lib/db";
import type { EventPayload } from "../src/lib/db/schema";

type SeedInput = {
  name: string;
  startsAt: string; // ISO UTC
  endsAt?: string;
  url: string;
  description: string;
  tags?: string[];
  priceTier?: "free" | "paid" | "invite";
  eventType?: EventPayload["eventType"];
  venue?: string;
};

const NYC = { city: "New York", country: "United States" };

const inputs: SeedInput[] = [
  // === Jun 2 — Tue ===
  {
    name: "Building to Disrupt: AI in Enterprise and Fintech (HSBC × a16z)",
    startsAt: "2026-06-02T17:00:00Z",
    endsAt: "2026-06-02T21:00:00Z",
    url: "https://www.tech-week.com/calendar/nyc/tracks/fintech",
    description:
      "HSBC + a16z host a NYC Tech Week conversation on where AI lands in enterprise + fintech stacks. Investor + operator-heavy room. RSVP via the NYC Tech Week fintech track.",
    tags: ["nyc-tech-week", "a16z", "hsbc", "ai", "fintech", "enterprise"],
    priceTier: "free",
    eventType: "meetup",
  },
  {
    name: "BCG × FT Partners Global Fintech Report Launch",
    startsAt: "2026-06-02T21:00:00Z",
    endsAt: "2026-06-02T23:00:00Z",
    url: "https://www.tech-week.com/calendar/nyc/tracks/fintech",
    description:
      "Public launch of the BCG + FT Partners Global Fintech Report during NYC Tech Week. Macro-data anchor for the week's fintech conversations — relevant if you're benchmarking the on-chain finance lane against tradfi numbers.",
    tags: ["nyc-tech-week", "bcg", "ft-partners", "fintech", "report"],
    priceTier: "free",
    eventType: "meetup",
  },

  // === Jun 3 — Wed ===
  {
    name: "Anthropic Founder Salon: Inside the AI-Native Era",
    startsAt: "2026-06-03T22:00:00Z",
    endsAt: "2026-06-04T02:00:00Z",
    url: "https://www.tech-week.com/calendar/nyc/tracks/ai-infra",
    description:
      "Anthropic-hosted founder salon at NYC Tech Week. Frontier-lab access in a room sized for actual conversation. Invite/RSVP gated — apply early via NYC Tech Week.",
    tags: ["nyc-tech-week", "anthropic", "ai", "founders", "frontier"],
    priceTier: "invite",
    eventType: "meetup",
  },
  {
    name: "AI Collective Demo Night (Atlassian × AI Collective)",
    startsAt: "2026-06-03T22:30:00Z",
    endsAt: "2026-06-04T02:00:00Z",
    url: "https://www.tech-week.com/calendar/nyc/tracks/ai-infra",
    description:
      "AI Collective's NYC demo night, co-hosted with Atlassian. Builder showcase + community drinks. One of the lower-friction frontier-AI rooms during NYC Tech Week.",
    tags: ["nyc-tech-week", "ai-collective", "atlassian", "demo-night", "ai"],
    priceTier: "free",
    eventType: "meetup",
  },
  {
    name: "Camp AI: Agents at Work (Intercom × Auth0 × Datadog)",
    startsAt: "2026-06-03T21:00:00Z",
    endsAt: "2026-06-04T01:00:00Z",
    url: "https://www.tech-week.com/calendar/nyc/tracks/ai-infra",
    description:
      "Intercom / Fin, Auth0, and Datadog jointly host a session on agentic AI in production — auth, observability, and ops for shipping agents. Practical for teams already in the agent stack.",
    tags: ["nyc-tech-week", "intercom", "auth0", "datadog", "agents", "ai"],
    priceTier: "free",
    eventType: "meetup",
  },
  {
    name: "Google for Startups Hub @ NYC Tech Week",
    startsAt: "2026-06-03T13:00:00Z",
    endsAt: "2026-06-05T23:00:00Z",
    url: "https://www.tech-week.com/calendar/nyc/tracks/ai-infra",
    description:
      "Three-day Google for Startups hub during NYC Tech Week — DeepMind updates, agent-stack masterclasses, CX Agent Studio sessions, founder workflow workshops, and the 'Architecture of Failure' 401-level AI agents session. The single highest density of frontier-AI Google content.",
    tags: ["nyc-tech-week", "google", "deepmind", "ai", "agents"],
    priceTier: "free",
    eventType: "workshop",
  },

  // === Jun 4 — Thu ===
  {
    name: "OpenAI Builder Lounge — NYC Tech Week",
    startsAt: "2026-06-04T17:00:00Z",
    endsAt: "2026-06-04T22:00:00Z",
    url: "https://www.tech-week.com/calendar/nyc/tracks/ai-infra",
    description:
      "OpenAI-hosted builder lounge during NYC Tech Week. RSVP-gated, builder-only room. The closest a16z-week analog to the OpenAI DevDay hallway — without travel.",
    tags: ["nyc-tech-week", "openai", "ai", "builders", "frontier"],
    priceTier: "invite",
    eventType: "meetup",
  },
  {
    name: "ElevenLabs: Live from NY",
    startsAt: "2026-06-04T22:00:00Z",
    endsAt: "2026-06-05T02:00:00Z",
    url: "https://www.tech-week.com/calendar/nyc/tracks/ai-infra",
    description:
      "ElevenLabs takeover at NYC Tech Week — product showcase + voice-AI builder community. Strong overlap with the agentic-voice hackathon track running the same week.",
    tags: ["nyc-tech-week", "elevenlabs", "voice-ai", "ai"],
    priceTier: "free",
    eventType: "meetup",
  },
  {
    name: "Pinecone Nexus AI Launch Party",
    startsAt: "2026-06-04T22:30:00Z",
    endsAt: "2026-06-05T02:00:00Z",
    url: "https://www.tech-week.com/calendar/nyc/tracks/ai-infra",
    description:
      "Pinecone launches Nexus AI during NYC Tech Week. Vector-DB infrastructure crowd, RAG/agents builders. RSVP-gated.",
    tags: ["nyc-tech-week", "pinecone", "ai", "vector-db", "rag", "launch"],
    priceTier: "invite",
    eventType: "meetup",
  },
  {
    name: "AI Builders Mixer (Techstars × DigitalOcean)",
    startsAt: "2026-06-04T23:00:00Z",
    endsAt: "2026-06-05T02:00:00Z",
    url: "https://www.tech-week.com/calendar/nyc/tracks/ai-infra",
    description:
      "Techstars + DigitalOcean co-host a builder mixer for AI-native founders during NYC Tech Week. Lower-friction onramp into the Techstars network for AI teams.",
    tags: ["nyc-tech-week", "techstars", "digitalocean", "ai", "founders"],
    priceTier: "free",
    eventType: "meetup",
  },

  // === Jun 5 — Fri ===
  {
    name: "a16z speedrun AI Faire (Speedrun × Orrick)",
    startsAt: "2026-06-05T17:00:00Z",
    endsAt: "2026-06-05T22:00:00Z",
    url: "https://speedrun.a16z.com/",
    description:
      "a16z speedrun's AI faire during NYC Tech Week, co-hosted with Orrick. Speedrun is already RexIntel's seeded a16z SR007 accelerator entry — this is the public-facing showcase. Worth attending if you're considering applying or already in the speedrun pipeline.",
    tags: ["nyc-tech-week", "a16z", "speedrun", "ai", "showcase"],
    priceTier: "free",
    eventType: "meetup",
  },
  {
    name: "The Light Stack 2026 (Sentry × Harness × Databricks Neon)",
    startsAt: "2026-06-05T21:00:00Z",
    endsAt: "2026-06-06T01:00:00Z",
    url: "https://www.tech-week.com/calendar/nyc/tracks/ai-infra",
    description:
      "Sentry, Harness, and Databricks/Neon jointly map the 'light stack' for AI-native shipping — observability, deploys, and Postgres at startup speed. Practical infra night.",
    tags: ["nyc-tech-week", "sentry", "harness", "databricks", "neon", "ai", "infra"],
    priceTier: "free",
    eventType: "meetup",
  },

  // === Hackathons across the week (curated subset) ===
  {
    name: "Voice Agents Weekender Hackathon (Leverage)",
    startsAt: "2026-06-05T13:00:00Z",
    endsAt: "2026-06-07T23:00:00Z",
    url: "https://www.tech-week.com/calendar/nyc/tracks/hackathons",
    description:
      "Weekend hackathon focused on voice agents — runs through Saturday into Sunday. Strong tie-in with the ElevenLabs Live event the night before.",
    tags: ["nyc-tech-week", "voice-ai", "hackathon", "weekend"],
    priceTier: "free",
    eventType: "hackathon",
  },
  {
    name: "SpacetimeDB Launchpad Hackathon",
    startsAt: "2026-06-05T13:00:00Z",
    endsAt: "2026-06-07T23:00:00Z",
    url: "https://www.tech-week.com/calendar/nyc/tracks/hackathons",
    description:
      "SpacetimeDB launchpad hackathon — real-time database + game/agent backend stack. Niche but high-signal for builders shipping multiplayer/agentic systems.",
    tags: ["nyc-tech-week", "spacetimedb", "hackathon", "real-time", "agents"],
    priceTier: "free",
    eventType: "hackathon",
  },
  {
    name: "Multimodal Hacks (Betaworks × Langchain × Google DeepMind)",
    startsAt: "2026-06-06T13:00:00Z",
    endsAt: "2026-06-06T23:00:00Z",
    url: "https://www.tech-week.com/calendar/nyc/tracks/hackathons",
    description:
      "Betaworks, Forever 22, Langchain, and Google DeepMind co-host a multimodal AI hackathon — vision + voice + text. Frontier model access on the day.",
    tags: ["nyc-tech-week", "betaworks", "langchain", "deepmind", "multimodal", "hackathon", "ai"],
    priceTier: "free",
    eventType: "hackathon",
  },
  {
    name: "NextGen BioAgents Hackathon (Nucleate NY)",
    startsAt: "2026-06-06T13:00:00Z",
    endsAt: "2026-06-06T23:00:00Z",
    url: "https://www.tech-week.com/calendar/nyc/tracks/hackathons",
    description:
      "Nucleate NY runs a bio-AI agents hackathon during NYC Tech Week. AI × bio cross-cut — fits the AI/robotics-broadens-all-lanes rule for the RexIntel audience.",
    tags: ["nyc-tech-week", "nucleate", "bio", "ai", "agents", "hackathon"],
    priceTier: "free",
    eventType: "hackathon",
  },
  {
    name: "Hardware Hack (localhost:nyc × Visionbrew × Connext)",
    startsAt: "2026-06-06T13:00:00Z",
    endsAt: "2026-06-06T23:00:00Z",
    url: "https://www.tech-week.com/calendar/nyc/tracks/hackathons",
    description:
      "Hardware hackathon for NYC Tech Week — localhost:nyc + Visionbrew + Connnext. AI × hardware cross-cut. The robotics-tail of the broadens-all-lanes rule.",
    tags: ["nyc-tech-week", "hardware", "robotics", "hackathon"],
    priceTier: "free",
    eventType: "hackathon",
  },
  {
    name: "Claude Code Hackathon — Build an Agentic Team",
    startsAt: "2026-06-04T13:00:00Z",
    endsAt: "2026-06-04T23:00:00Z",
    url: "https://www.tech-week.com/calendar/nyc/tracks/hackathons",
    description:
      "Claude Code + agentic-team hackathon hosted by Elevate Online and Imaginary Space during NYC Tech Week. Directly aligned with the agent-stack tooling RexIntel itself runs on.",
    tags: ["nyc-tech-week", "claude", "anthropic", "agents", "hackathon"],
    priceTier: "free",
    eventType: "hackathon",
  },
  {
    name: "Proof of Build — An Agent Building Hackathon by Lyzr",
    startsAt: "2026-06-04T13:00:00Z",
    endsAt: "2026-06-04T23:00:00Z",
    url: "https://www.tech-week.com/calendar/nyc/tracks/hackathons",
    description:
      "Lyzr-hosted hackathon for agentic AI builders. Single-day NYC Tech Week format.",
    tags: ["nyc-tech-week", "lyzr", "agents", "hackathon"],
    priceTier: "free",
    eventType: "hackathon",
  },
];

function toPayload(input: SeedInput): EventPayload {
  return {
    name: input.name,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    venue: input.venue,
    city: NYC.city,
    country: NYC.country,
    url: input.url,
    description: input.description,
    tags: input.tags,
    priceTier: input.priceTier ?? "free",
    eventType: input.eventType ?? "meetup",
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
    `\n✓ ${inputs.length} NYC Tech Week side events processed (${inserted} new, ${updated} updated).`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
