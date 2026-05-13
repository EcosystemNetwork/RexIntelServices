/**
 * Run with: npx tsx scripts/seed-event-agentic-summit.ts
 *
 * Seeds the tokens& Agentic Engineering Summit (SF, Jun 18 2026) as an
 * approved + published Field Calendar entry. Idempotent: matched by
 * payload->>'name'.
 */
import "dotenv/config";
import { and, eq, sql } from "drizzle-orm";
import { db, submissions } from "../src/lib/db";
import type { EventPayload } from "../src/lib/db/schema";

const payload: EventPayload = {
  name: "Agentic Engineering Summit SF 2026",
  startsAt: "2026-06-18T16:30:00Z", // 9:30 AM PDT
  endsAt: "2026-06-19T02:30:00Z", // 7:30 PM PDT
  city: "San Francisco",
  country: "United States",
  url: "https://luma.com/agentsummit",
  description:
    "One-day SF summit by tokens& on agentic engineering. 9:30 AM – 7:30 PM PDT, with talks and demos from builders shipping production agent systems. Approval required to attend.",
  eventType: "conference",
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
        publishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(submissions.id, existing[0].id))
      .returning({ publicId: submissions.publicId });
    console.log(`updated  /events/${row.publicId}  ${payload.name}`);
    process.exit(0);
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
  console.log(`inserted /events/${row.publicId}  ${payload.name}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
