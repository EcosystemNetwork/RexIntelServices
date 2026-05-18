import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, submitters, submissions, contributionEvents } from "../src/lib/db";
import { tierForPoints } from "../src/lib/clearance";

// Seeds synthetic submitters so the UI surfaces have something to render.
// Cleanup: `npx tsx scripts/_seed-test-trust.ts clean`
const SEEDS = [
  {
    email: "trust-test-alice@example.com",
    slug: "trust-test-alice",
    handle: "alice-test",
    bio: "Synthetic test contributor for UI verification.",
    events: [
      { kind: "incident_accepted" as const, points: 50 },
      { kind: "incident_accepted" as const, points: 50 },
      { kind: "original_accepted" as const, points: 15 },
      { kind: "intel_cited" as const, points: 1 },
    ],
    approvedTitle: "[TEST] Lazarus exploit timeline",
  },
  {
    email: "trust-test-bob@example.com",
    slug: "trust-test-bob",
    handle: "bob-test",
    bio: "Another synthetic contributor.",
    events: [
      { kind: "tip_accepted" as const, points: 5 },
      { kind: "tip_accepted" as const, points: 5 },
      { kind: "address_tag_accepted" as const, points: 5 },
    ],
    approvedTitle: "[TEST] Suspicious bridge address sighting",
  },
];

(async () => {
  if (process.argv[2] === "clean") {
    for (const s of SEEDS) {
      const [sub] = await db
        .select({ id: submitters.id })
        .from(submitters)
        .where(eq(submitters.email, s.email));
      if (!sub) continue;
      await db.delete(submissions).where(eq(submissions.submitterId, sub.id));
      await db
        .delete(contributionEvents)
        .where(eq(contributionEvents.submitterId, sub.id));
      await db.delete(submitters).where(eq(submitters.id, sub.id));
      console.log(`cleaned ${s.email}`);
    }
    process.exit(0);
  }

  for (const s of SEEDS) {
    const total = s.events.reduce((sum, e) => sum + e.points, 0);
    const tier = tierForPoints(total);
    const [inserted] = await db
      .insert(submitters)
      .values({
        email: s.email,
        slug: s.slug,
        displayHandle: s.handle,
        bio: s.bio,
        points: total,
        clearanceTier: tier,
      })
      .onConflictDoUpdate({
        target: submitters.slug,
        set: {
          points: total,
          clearanceTier: tier,
          bio: s.bio,
          displayHandle: s.handle,
        },
      })
      .returning({ id: submitters.id });

    await db
      .delete(contributionEvents)
      .where(eq(contributionEvents.submitterId, inserted.id));
    for (const e of s.events) {
      await db.insert(contributionEvents).values({
        submitterId: inserted.id,
        kind: e.kind,
        points: e.points,
      });
    }

    await db
      .insert(submissions)
      .values({
        type: "intel",
        status: "approved",
        payload: {
          kind: "incident",
          headline: s.approvedTitle,
          body: "Synthetic test.",
        },
        submitterId: inserted.id,
        submitterEmail: s.email,
        submitterHandle: s.handle,
        publishedAt: new Date(),
        publicId: `test-${s.slug}`.slice(0, 16),
      })
      .onConflictDoNothing();

    console.log(`seeded ${s.slug}: ${total} pts, tier=${tier}`);
  }

  process.exit(0);
})();
