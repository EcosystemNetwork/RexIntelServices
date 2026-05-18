/**
 * Run with: npx tsx scripts/seed-event-from-url.ts <url> [<url> ...]
 *
 * Adds one or more events to Field Calendar by URL. Parses each URL with
 * the same JSON-LD/OG extractor the public submission form uses, then
 * inserts (or updates) as an approved + published submission when the
 * host is in TRUSTED_EVENT_HOSTS. Untrusted hosts land as pending for
 * curator review.
 *
 * Idempotent: matched by payload->>'url'.
 */
import "dotenv/config";
import { and, eq, sql } from "drizzle-orm";
import { db, submissions } from "../src/lib/db";
import type { EventPayload } from "../src/lib/db/schema";
import { parseEventUrl, isTrustedEventUrl } from "../src/lib/event-parser";

async function seedOne(rawUrl: string) {
  const parsed = await parseEventUrl(rawUrl);
  if (!parsed.ok) {
    console.error(`✗ ${rawUrl}  —  ${parsed.error.code}: ${parsed.error.message}`);
    return;
  }

  const { payload: partial, canonicalUrl } = parsed.data;
  if (!partial.name || !partial.startsAt) {
    console.error(
      `✗ ${rawUrl}  —  missing required fields after parse (name=${!!partial.name}, startsAt=${!!partial.startsAt})`,
    );
    return;
  }

  const payload: EventPayload = {
    name: partial.name,
    startsAt: partial.startsAt,
    endsAt: partial.endsAt,
    venue: partial.venue,
    city: partial.city,
    country: partial.country,
    url: canonicalUrl,
    description: partial.description,
    eventType: partial.eventType,
    imageUrl: partial.imageUrl,
  };

  const trusted = isTrustedEventUrl(canonicalUrl);
  const status: "approved" | "pending" = trusted ? "approved" : "pending";
  const eventStartsAt = new Date(payload.startsAt);
  const eventEndsAt = payload.endsAt ? new Date(payload.endsAt) : null;

  const existing = await db
    .select({ id: submissions.id, publicId: submissions.publicId })
    .from(submissions)
    .where(
      and(
        eq(submissions.type, "event"),
        sql`${submissions.payload}->>'url' = ${canonicalUrl}`,
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
        status,
        publishedAt: status === "approved" ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(submissions.id, existing[0].id))
      .returning({ publicId: submissions.publicId });
    console.log(`updated  ${status.padEnd(8)}  /events/${row.publicId}  ${payload.name}`);
    return;
  }

  const [row] = await db
    .insert(submissions)
    .values({
      type: "event",
      status,
      payload,
      eventStartsAt,
      eventEndsAt,
      publishedAt: status === "approved" ? new Date() : null,
      reviewNotes: `seeded via seed-event-from-url: ${canonicalUrl}`,
    })
    .returning({ publicId: submissions.publicId });
  console.log(`inserted ${status.padEnd(8)}  /events/${row.publicId}  ${payload.name}`);
}

async function main() {
  const urls = process.argv.slice(2).filter((a) => /^https?:\/\//.test(a));
  if (urls.length === 0) {
    console.error("Usage: npx tsx scripts/seed-event-from-url.ts <url> [<url> ...]");
    process.exit(1);
  }
  for (const url of urls) {
    try {
      await seedOne(url);
    } catch (e) {
      console.error(`✗ ${url}  —  ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
