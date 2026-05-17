/**
 * Run with: npx tsx scripts/seed-residencies.ts
 *
 * Seeds known founder/builder residency programs into the Residencies lane.
 * Dates use approximate next-cohort windows when the host site doesn't
 * publish exact ones; submitters or admins can refresh via the edit-token
 * flow once cohort intake firms up.
 *
 * Idempotent: name-match upsert.
 */
import "dotenv/config";
import { and, eq, sql } from "drizzle-orm";
import { db, submissions } from "../src/lib/db";
import type { ResidencyPayload } from "../src/lib/db/schema";

const residencies: ResidencyPayload[] = [
  {
    name: "The Bridge by Entrepreneurs First",
    organization: "Entrepreneurs First",
    organizationUrl: "https://www.join-thebridge.com/",
    description:
      "San Francisco residency for non-US founders at stage 0 — pre-idea, pre-team, pre-product. EF's $250k initial investment and a peer-driven build community designed as the fastest path into Silicon Valley. Backed by Patrick + John Collison, Demis Hassabis, Nat Friedman, Reid Hoffman, and others. Portfolio value >$16B. Cohort dates rotate — confirm current intake on the program site.",
    // Approximate next-cohort window. Update via the edit-token flow once
    // EF publishes specific dates.
    startsAt: "2026-08-01T12:00:00Z",
    endsAt: "2026-10-31T12:00:00Z",
    city: "San Francisco",
    country: "United States",
    url: "https://www.join-thebridge.com/",
    applyUrl: "https://www.join-thebridge.com/apply",
    rolling: true,
    cohortSize: "Cohort-based (EF residency)",
    cost: "No cost — $250k investment included",
    focus: "Non-US stage-0 founders, sector-agnostic (AI, fintech, robotics, etc.)",
    tags: ["entrepreneurs-first", "founders", "san-francisco", "stage-zero"],
  },
  {
    name: "HF0 — Hacker Fellowship Zero",
    organization: "HF0",
    organizationUrl: "https://www.hf0.com/",
    description:
      "12-week live-in residency for repeat founders building serious software. Cohorts in San Francisco; the program is famous for stripping away every distraction so founders ship from day one. Two cohorts a year (next: starts Sep 13 with Demo Day Dec 4; the following one starts Jan 4). Application is open year-round and applicants are reviewed against upcoming batches.",
    startsAt: "2026-09-13T12:00:00Z",
    endsAt: "2026-12-04T12:00:00Z",
    city: "San Francisco",
    country: "United States",
    url: "https://www.hf0.com/",
    applyUrl: "https://www.hf0.com/apply",
    rolling: true,
    cohortSize: "Small cohort (~12 founders)",
    cost: "Live-in; equity terms confirmed in interview",
    focus: "Repeat founders shipping serious software",
    tags: ["repeat-founders", "san-francisco", "live-in", "ship"],
  },
  {
    name: "South Park Commons — Member Residency",
    organization: "South Park Commons",
    organizationUrl: "https://southparkcommons.com/",
    description:
      "6-month community residency for technologists who aren't yet fundraising-ready — exploring options, validating ideas, finding collaborators, building conviction on what to pursue next. Distinct from SPC's Founder Fellowship (which writes $1M–$10M into companies that already know they're going). About 70% of members go on to found ventures; 30% pursue research or other paths. No cost, no equity. SF / NYC / Bengaluru.",
    // 6-month rolling intake — using H2 2026 as the placeholder window.
    // Update once SPC publishes specific cohort dates.
    startsAt: "2026-06-01T12:00:00Z",
    endsAt: "2026-11-30T12:00:00Z",
    city: "San Francisco · NYC · Bengaluru",
    country: "United States · India",
    url: "https://southparkcommons.com/",
    applyUrl: "https://www.southparkcommons.com/apply/application",
    rolling: true,
    cohortSize: "Selective rolling intake",
    cost: "Free · no equity",
    focus: "Technologists in the -1 to 0 zone (pre-fundraise)",
    tags: ["spc", "technical-founders", "research", "free", "no-equity"],
  },
  {
    name: "Afore Founders-in-Residence — Summer 2026",
    organization: "Afore Capital",
    organizationUrl: "https://www.afore.vc/",
    description:
      "10-week in-person residency in Afore's South Park, SF office for founders at the -1 to 0 stage. Minimum $100k investment per founder, plus 1:1 mentorship from the Afore team, weekly demo lunches, office space, and access to the Afore Hive (10,000+ prospective customers + advisors). Both solo founders and teams; no traction required. Eligible: students, part-time tinkerers, or full-time founders. Summer 2026 kickoff — confirm exact dates on the application page.",
    // Summer 2026 placeholder; ~10 weeks per Afore's published format.
    startsAt: "2026-07-01T12:00:00Z",
    endsAt: "2026-09-09T12:00:00Z",
    city: "San Francisco",
    country: "United States",
    url: "https://www.afore.vc/residence",
    applyUrl: "https://airtable.com/appHA7vorKg1qfoKP/shr8IEkORG4YNwvRc",
    // Afore reviews FIR applications continuously across summer/fall cohorts.
    rolling: true,
    cohortSize: "5–8 founders",
    cost: "$100k minimum investment per founder",
    focus: "-1 to 0 stage, sector-agnostic, students welcome",
    tags: ["afore", "san-francisco", "pre-product", "students-ok"],
  },
  {
    name: "Long Journey Residency at Edge Esmeralda 2026",
    organization: "Long Journey Ventures · Edge City",
    organizationUrl: "https://www.edgecity.live/blog/long-journey-residency-2026-announcement",
    description:
      "Month-long pre-accelerator residency hosted inside Edge Esmeralda 2026, the Healdsburg CA pop-up village. Live and build alongside 400+ of the world's most ambitious builders, researchers, and creators. 'For the magically weird' — Long Journey's frontier-and-strange thesis applied to early-stage founders.",
    startsAt: "2026-05-30T12:00:00Z",
    endsAt: "2026-06-27T12:00:00Z",
    city: "Healdsburg",
    country: "United States",
    venue: "Edge Esmeralda village",
    url: "https://www.edgecity.live/blog/long-journey-residency-2026-announcement",
    applyUrl: "https://www.edgeesmeralda.com/",
    // Edge Esmeralda pricing rises monthly; effective cutoff is kickoff day.
    applicationDeadline: "2026-05-29T23:59:00Z",
    cohortSize: "Small cohort inside the 1,000+ Edge village",
    cost: "Edge Esmeralda pricing applies",
    focus: "Frontier / 'magically weird' early-stage founders",
    tags: ["edge-city", "long-journey", "pre-accelerator", "frontier"],
  },
  {
    name: "Zee Prime Residency at Edge Esmeralda 2026",
    organization: "Zee Prime Capital · Edge City",
    organizationUrl: "https://www.edgecity.live/blog/announcing-the-zee-prime-residency-at-edge-esmeralda-2026",
    description:
      "10+ deep-tech founders selected to spend a full month inside Edge Esmeralda 2026, live and build alongside the broader 1,000+ Edge community of builders, researchers, and mentors. Zee Prime backs frontier deep-tech and crypto teams; the residency is the firm's funnel for in-thesis founders.",
    startsAt: "2026-05-30T12:00:00Z",
    endsAt: "2026-06-27T12:00:00Z",
    city: "Healdsburg",
    country: "United States",
    venue: "Edge Esmeralda village",
    url: "https://www.edgecity.live/blog/announcing-the-zee-prime-residency-at-edge-esmeralda-2026",
    applyUrl: "https://www.edgeesmeralda.com/",
    // Tied to Edge Esmeralda 2026 — application closes at kickoff.
    applicationDeadline: "2026-05-29T23:59:00Z",
    cohortSize: "10+ deep-tech founders",
    cost: "Edge Esmeralda pricing applies",
    focus: "Deep-tech, crypto, frontier infrastructure",
    tags: ["edge-city", "zee-prime", "deep-tech", "crypto"],
  },
  {
    name: "Vitalia Founder Residency — Roatán 2026",
    organization: "Vitalia",
    organizationUrl: "https://www.vitalia.city/",
    description:
      "Month-long founder residency on Roatán Island inside the Próspera special-economic zone. Programming includes founder workshops, pitching practice, and community living for biotech / longevity / quantified-self / web3 builders from ideation through early-stage fundraising. Self-funded budget ~$2-5k/month (additional $1-2.5k for a second month). Direct 2.5h flights from Miami / Houston. Need-based financial support via the Infinita Ambassador Program.",
    startsAt: "2026-03-01T12:00:00Z",
    endsAt: "2026-03-31T12:00:00Z",
    city: "Roatán",
    country: "Honduras",
    venue: "Próspera Zone, Roatán Island",
    url: "https://www.vitalia.city/",
    applyUrl: "https://www.vitalia.city/",
    cohortSize: "Cohort residency",
    cost: "~$2-5k self-funded (need-based support available)",
    focus: "Longevity biotech, life extension, frontier health, web3",
    tags: ["vitalia", "longevity", "biotech", "prospera", "founders"],
  },
  {
    name: "Antler Residency Program",
    organization: "Antler",
    organizationUrl: "https://www.antler.co/",
    description:
      "Global pre-team residency that brings together pre-idea, pre-team founders for a 10-week cohort in one of Antler's 30+ locations (NYC, SF, London, Singapore, Stockholm, Berlin, Toronto, Sydney, Bangalore, etc.). Founders explore co-founder matches, validate ideas, and pitch to Antler's investment committee for a $250k–$500k pre-seed check. ~150 companies funded per year globally; alumni include Airalo, Sambla, Index. Rolling cohorts in each location.",
    startsAt: "2026-06-01T12:00:00Z",
    endsAt: "2026-08-15T12:00:00Z",
    city: "Multiple — 30+ global locations",
    country: "Multi-country",
    url: "https://www.antler.co/",
    applyUrl: "https://www.antler.co/apply",
    // Antler explicitly accepts applications continuously across cohorts.
    rolling: true,
    cohortSize: "~30 founders per location",
    cost: "Free for residency; equity stake on follow-on investment",
    focus: "Pre-team founders, sector-agnostic — fintech, AI, SaaS, deep tech",
    tags: ["antler", "global", "pre-team", "cohort", "co-founder-match"],
  },
  {
    name: "Pioneer Fellowship",
    organization: "Pioneer.app",
    organizationUrl: "https://pioneer.app/",
    description:
      "Online tournament + fellowship for outsider founders. Anyone, anywhere can compete weekly on a public leaderboard scored by other Pioneer competitors. Top performers earn the Pioneer Fellowship — $100k investment + invitation to San Francisco for a structured demo-day program. Originally Daniel Gross's project; remains the canonical 'apply from anywhere, no warm intro required' founder funnel.",
    startsAt: "2026-01-01T12:00:00Z",
    endsAt: "2026-12-31T23:59:00Z",
    city: "Online + San Francisco",
    country: "Global",
    url: "https://pioneer.app/",
    applyUrl: "https://pioneer.app/",
    rolling: true,
    cohortSize: "Rolling weekly tournament; ~30 fellows per batch",
    cost: "Free to compete; $100k investment if selected",
    focus: "Outsider founders, sector-agnostic, application-meritocratic",
    tags: ["pioneer", "tournament", "global", "remote-friendly"],
  },
  {
    name: "Berkeley SkyDeck",
    organization: "UC Berkeley",
    organizationUrl: "https://skydeck.berkeley.edu/",
    description:
      "UC Berkeley's accelerator + residency for early-stage startups. Two main paths: the Pad-13 partnership track for Berkeley-affiliated teams (no equity, free) and the HotDesk Sponsorship for non-Berkeley teams. The flagship Cohort program offers $200k investment for 5% common stock, six months of in-person programming, and access to 300+ industry advisors. Strong deep-tech and AI bias.",
    startsAt: "2026-08-01T12:00:00Z",
    endsAt: "2027-01-31T12:00:00Z",
    city: "Berkeley",
    country: "United States",
    url: "https://skydeck.berkeley.edu/",
    applyUrl: "https://skydeck.berkeley.edu/apply/",
    // SkyDeck accepts year-round across the Cohort and HotDesk tracks.
    rolling: true,
    cohortSize: "~25-30 startups per cohort",
    cost: "$200k investment for 5% common (Cohort program)",
    focus: "Deep tech, AI, biotech, hardware — Berkeley + global",
    tags: ["skydeck", "berkeley", "deep-tech", "ai", "biotech"],
  },
];

async function upsert(payload: ResidencyPayload) {
  const eventStartsAt = new Date(payload.startsAt);
  const eventEndsAt = new Date(payload.endsAt);
  const existing = await db
    .select({ id: submissions.id, publicId: submissions.publicId })
    .from(submissions)
    .where(
      and(
        eq(submissions.type, "residency"),
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
        eventEndsAt,
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
      type: "residency",
      status: "approved",
      payload,
      eventStartsAt,
      eventEndsAt,
      publishedAt: new Date(),
    })
    .returning({ publicId: submissions.publicId });
  return { action: "inserted" as const, publicId: row.publicId };
}

async function main() {
  let inserted = 0;
  let updated = 0;
  for (const r of residencies) {
    const result = await upsert(r);
    if (result.action === "inserted") inserted++;
    else updated++;
    console.log(`  ${result.action.padEnd(8)} /pop-up-cities/${result.publicId}  ${r.name}`);
  }
  console.log(
    `\n✓ ${residencies.length} residencies processed (${inserted} new, ${updated} updated).`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
