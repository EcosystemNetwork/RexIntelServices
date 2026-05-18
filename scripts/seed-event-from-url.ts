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
import { sql } from "drizzle-orm";
import { db } from "../src/lib/db";
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

  // Raw SQL on purpose: production DB is behind on migration 0027 which
  // adds submissions.graph_attribution_status — Drizzle's prepared-statement
  // shape against the current schema trips that column reference even though
  // the insert doesn't set it. Naming columns explicitly avoids the drift.
  const reviewNotes = `seeded via seed-event-from-url: ${canonicalUrl}`;
  const publishedAt = status === "approved" ? new Date() : null;
  const payloadJson = JSON.stringify(payload);

  const existing = await db.execute(sql`
    SELECT id, public_id
    FROM submissions
    WHERE type = 'event'
      AND payload->>'url' = ${canonicalUrl}
    LIMIT 1
  `);

  const existingRows = existing.rows as Array<{ id: string; public_id: string }>;
  if (existingRows.length > 0) {
    const id = existingRows[0].id;
    const updated = await db.execute(sql`
      UPDATE submissions
      SET payload = ${payloadJson}::jsonb,
          event_starts_at = ${eventStartsAt},
          event_ends_at = ${eventEndsAt},
          status = ${status},
          published_at = ${publishedAt},
          updated_at = NOW()
      WHERE id = ${id}
      RETURNING public_id
    `);
    const pubId = (updated.rows[0] as { public_id: string }).public_id;
    console.log(`updated  ${status.padEnd(8)}  /events/${pubId}  ${payload.name}`);
    return;
  }

  const inserted = await db.execute(sql`
    INSERT INTO submissions (type, status, payload, event_starts_at, event_ends_at, published_at, review_notes)
    VALUES ('event', ${status}, ${payloadJson}::jsonb, ${eventStartsAt}, ${eventEndsAt}, ${publishedAt}, ${reviewNotes})
    RETURNING public_id
  `);
  const pubId = (inserted.rows[0] as { public_id: string }).public_id;
  console.log(`inserted ${status.padEnd(8)}  /events/${pubId}  ${payload.name}`);
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
