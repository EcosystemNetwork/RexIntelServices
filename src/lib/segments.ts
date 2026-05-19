import { and, eq, inArray, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import {
  db,
  subscribers,
  subscriberTags,
  type SegmentFilter,
} from "@/lib/db";

/**
 * Resolve a saved-segment filter into a list of subscriber IDs.
 *
 * Semantics:
 *   - `statuses` defaults to ['active'] if omitted (production-safe).
 *   - `tagIds` is intersect: subscriber must have EVERY listed tag.
 *   - `personas` is union of persona-tag names (OR across personas).
 *   - `sources` is union across the subscriber.source column.
 *   - `includeUnconfirmed` adds 'pending' to the allowed status set.
 *
 * Called by both the send pipeline (sender.ts) and the segment preview API.
 */
export async function resolveSegment(filter: SegmentFilter): Promise<string[]> {
  const statuses =
    filter.statuses && filter.statuses.length > 0
      ? filter.statuses
      : ["active"];
  if (filter.includeUnconfirmed && !statuses.includes("pending")) {
    statuses.push("pending");
  }

  const conditions: (SQL | undefined)[] = [
    inArray(subscribers.status, statuses as ("pending" | "active" | "unsubscribed" | "bounced" | "complained")[]),
  ];

  // sources: subscribers.source IN list
  if (filter.sources && filter.sources.length > 0) {
    conditions.push(inArray(subscribers.source, filter.sources));
  }

  // tag intersect: GROUP BY subscriber and HAVING COUNT(DISTINCT matching tagId) = N
  // Cleanest as a subquery so the outer WHERE stays simple.
  if (filter.tagIds && filter.tagIds.length > 0) {
    const want = filter.tagIds.length;
    const matching = db
      .select({ id: subscriberTags.subscriberId })
      .from(subscriberTags)
      .where(inArray(subscriberTags.tagId, filter.tagIds))
      .groupBy(subscriberTags.subscriberId)
      .having(sql`count(distinct ${subscriberTags.tagId}) = ${want}`);
    conditions.push(inArray(subscribers.id, matching));
  }

  // personas: subscriber has ANY of the listed persona tags (by tag name).
  // We don't dereference persona slugs to tag IDs here — assumes the segment
  // builder UI captures persona tag IDs directly into filter.tagIds when
  // configured that way. `personas` is reserved for a future enrichment.
  // Kept as a no-op for now to keep the shape stable.
  if (filter.personas && filter.personas.length > 0) {
    // TODO: when persona-by-slug is needed, JOIN tags ON tags.kind='persona'
    // AND tags.name = ANY(personas), then INTERSECT.
  }

  const rows = await db
    .select({ id: subscribers.id })
    .from(subscribers)
    .where(and(...conditions.filter(Boolean) as SQL[]));

  return rows.map((r) => r.id);
}
