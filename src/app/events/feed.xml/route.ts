import { and, asc, eq, gte } from "drizzle-orm";
import { db, submissions } from "@/lib/db";
import type { EventPayload } from "@/lib/db/schema";
import { buildRssFeed } from "@/lib/rss";
import { absoluteUrl, siteUrl } from "@/lib/site-url";
import { detailHref } from "@/lib/slug";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * RSS 2.0 feed of upcoming events. Sorted by event start ascending so
 * subscribers see the next thing happening first.
 */
export async function GET() {
  const now = new Date();
  const rows = await db
    .select({
      publicId: submissions.publicId,
      payload: submissions.payload,
      publishedAt: submissions.publishedAt,
      eventStartsAt: submissions.eventStartsAt,
    })
    .from(submissions)
    .where(
      and(
        eq(submissions.type, "event"),
        eq(submissions.status, "approved"),
        gte(submissions.eventStartsAt, now),
      ),
    )
    .orderBy(asc(submissions.eventStartsAt))
    .limit(100);

  const xml = buildRssFeed({
    title: "Rex Intel Services — Field Calendar",
    link: siteUrl(),
    description: "Curated crypto events worth tracking.",
    selfLink: absoluteUrl("/events/feed.xml"),
    items: rows.map((r) => {
      const p = r.payload as EventPayload;
      const start = new Date(p.startsAt);
      const dateLabel = start.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      const location = [p.city, p.country].filter(Boolean).join(", ");
      const desc = `${dateLabel}${location ? " · " + location : ""}\n\n${p.description ?? ""}`;
      const href = absoluteUrl(detailHref("/events", r.publicId, p.name));
      return {
        title: p.name,
        link: href,
        description: desc,
        pubDate: r.publishedAt,
        category: p.eventType,
        guid: href,
      };
    }),
  });

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
