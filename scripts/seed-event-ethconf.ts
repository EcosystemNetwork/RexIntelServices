/**
 * Run with: npx tsx scripts/seed-event-ethconf.ts
 *
 * Seeds the ETHConf 2026 event as our first published Field Calendar entry.
 * Idempotent: re-running updates the existing row instead of inserting a
 * duplicate.
 */
import "dotenv/config";
import { and, eq, sql } from "drizzle-orm";
import { db, submissions } from "../src/lib/db";
import type { EventPayload } from "../src/lib/db/schema";

const payload: EventPayload = {
  name: "ETHConf 2026",
  startsAt: "2026-06-08T13:00:00Z", // 9:00 AM ET
  endsAt: "2026-06-10T22:00:00Z", // 6:00 PM ET
  venue: "Javits Center",
  city: "New York",
  country: "USA",
  url: "https://ethconf.com/",
  description:
    "Three-day Ethereum gathering for founders, industry leaders, and builders. Keynotes, technical summits, and panels covering DeFi, institutional adoption, and protocol updates.",
  tags: ["ethereum", "defi", "infrastructure"],
  priceTier: "paid",
  eventType: "conference",
  imageUrl: "/Rex-Intel-ETHConf-Social-Card.png",
};

async function main() {
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
        featured: true,
        publishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(submissions.id, existing[0].id))
      .returning({ publicId: submissions.publicId });
    console.log(`✓ Updated existing event: /events/${row.publicId}`);
  } else {
    const [row] = await db
      .insert(submissions)
      .values({
        type: "event",
        status: "approved",
        featured: true,
        payload,
        eventStartsAt,
        publishedAt: new Date(),
      })
      .returning({ publicId: submissions.publicId });
    console.log(`✓ Inserted event: /events/${row.publicId}`);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
