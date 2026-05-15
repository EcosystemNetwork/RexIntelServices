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
    cohortSize: "5–8 founders",
    cost: "$100k minimum investment per founder",
    focus: "-1 to 0 stage, sector-agnostic, students welcome",
    tags: ["afore", "san-francisco", "pre-product", "students-ok"],
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
