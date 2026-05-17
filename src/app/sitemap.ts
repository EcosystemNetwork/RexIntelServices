import type { MetadataRoute } from "next";
import { desc, eq, sql } from "drizzle-orm";
import { db, submissions } from "@/lib/db";
import { siteUrl } from "@/lib/site-url";
import { detailSegment } from "@/lib/slug";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Full sitemap covering every public surface plus a row per approved
 * submission. Refreshed on demand (force-dynamic) so newly-approved
 * content appears in the sitemap on the next crawl rather than waiting
 * for a rebuild.
 *
 * Caps applied per surface to keep the sitemap under the 50k-URL Google
 * limit; if any board passes ~5k items we should split into per-type
 * sitemaps (Next supports a sitemap index file).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: "daily", priority: 1.0 },
    { url: `${base}/intel`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: `${base}/intel/leaderboard`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${base}/events`, lastModified: now, changeFrequency: "hourly", priority: 0.8 },
    { url: `${base}/hackathons`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${base}/intel?lane=cities`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${base}/intel?lane=grants`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${base}/intel?lane=accelerators`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${base}/intel?lane=capital`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${base}/intel?lane=residencies`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${base}/intel?lane=perks`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${base}/jobs`, lastModified: now, changeFrequency: "daily", priority: 0.6 },
    { url: `${base}/submit`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
  ];

  // Submissions — one entry per (type, publicId). Pull the human-readable
  // title field (varies per type) so the sitemap entry matches the canonical
  // slug-prefixed URL the detail page redirects to. Also pull eventType so
  // we can split hackathons (stored as type='event' + eventType='hackathon')
  // off into the /hackathons routes where they're actually rendered.
  const subs = await db
    .select({
      type: submissions.type,
      publicId: submissions.publicId,
      publishedAt: submissions.publishedAt,
      updatedAt: submissions.updatedAt,
      eventType: sql<string | null>`${submissions.payload}->>'eventType'`,
      slugTitle: sql<string | null>`COALESCE(
        ${submissions.payload}->>'name',
        ${submissions.payload}->>'title',
        ${submissions.payload}->>'headline'
      )`,
    })
    .from(submissions)
    .where(eq(submissions.status, "approved"))
    .orderBy(desc(submissions.publishedAt))
    .limit(20_000);

  // Path prefix per submission type. Keep this list aligned with the
  // public route folders — anything mismatched simply gets dropped.
  const PATH_PREFIX: Record<string, string> = {
    intel: "/intel",
    event: "/events",
    popup_city: "/pop-up-cities",
    grant: "/grants",
    accelerator: "/accelerators",
    job: "/jobs",
    capital: "/capital",
    perks: "/perks",
    residency: "/pop-up-cities",
  };

  const submissionEntries: MetadataRoute.Sitemap = [];
  for (const s of subs) {
    // Hackathons live under type='event' with payload.eventType='hackathon';
    // route them to /hackathons (where the listing actually renders) instead
    // of /events.
    const prefix =
      s.type === "event" && s.eventType === "hackathon"
        ? "/hackathons"
        : PATH_PREFIX[s.type];
    if (!prefix) continue;
    submissionEntries.push({
      url: `${base}${prefix}/${detailSegment(s.publicId, s.slugTitle)}`,
      lastModified: s.updatedAt ?? s.publishedAt ?? undefined,
      changeFrequency:
        s.type === "intel" || s.type === "event" ? "weekly" : "monthly",
      priority: s.type === "intel" ? 0.7 : 0.6,
    });
  }

  return [...staticEntries, ...submissionEntries];
}
