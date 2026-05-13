import { and, desc, eq } from "drizzle-orm";
import { db, submissions } from "@/lib/db";
import type { IntelPayload } from "@/lib/db/schema";
import { buildRssFeed } from "@/lib/rss";
import { absoluteUrl, siteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * RSS 2.0 feed of approved Intel Wire items. Capped at 100 most recent.
 * Caches 5 minutes at the CDN edge so a bursty subscriber feed reader
 * crowd doesn't hit Postgres each poll.
 */
export async function GET() {
  const rows = await db
    .select({
      publicId: submissions.publicId,
      payload: submissions.payload,
      publishedAt: submissions.publishedAt,
    })
    .from(submissions)
    .where(and(eq(submissions.type, "intel"), eq(submissions.status, "approved")))
    .orderBy(desc(submissions.publishedAt))
    .limit(100);

  const xml = buildRssFeed({
    title: "Rex Intel Services — Intel Wire",
    link: siteUrl(),
    description: "Field-submitted, analyst-reviewed intelligence on the digital asset markets.",
    selfLink: absoluteUrl("/intel/feed.xml"),
    items: rows.map((r) => {
      const p = r.payload as IntelPayload;
      return {
        title: p.headline,
        link: absoluteUrl(`/intel/${r.publicId}`),
        description: p.body,
        pubDate: r.publishedAt,
        category: p.category,
        guid: absoluteUrl(`/intel/${r.publicId}`),
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
