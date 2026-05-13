import type { MetadataRoute } from "next";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, addresses, intelAddresses, submissions } from "@/lib/db";
import { siteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Full sitemap covering every public surface plus a row per approved
 * submission and tracked address. Refreshed on demand (force-dynamic) so
 * newly-approved content appears in the sitemap on the next crawl rather
 * than waiting for a rebuild.
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
    { url: `${base}/addresses`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: `${base}/events`, lastModified: now, changeFrequency: "hourly", priority: 0.8 },
    { url: `${base}/pop-up-cities`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${base}/grants`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${base}/accelerators`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${base}/jobs`, lastModified: now, changeFrequency: "daily", priority: 0.6 },
    { url: `${base}/submit`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
  ];

  // Submissions — one entry per (type, publicId), grouped so we can set
  // a sensible per-type priority + change frequency from the same query.
  const subs = await db
    .select({
      type: submissions.type,
      publicId: submissions.publicId,
      publishedAt: submissions.publishedAt,
      updatedAt: submissions.updatedAt,
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
  };

  const submissionEntries: MetadataRoute.Sitemap = [];
  for (const s of subs) {
    const prefix = PATH_PREFIX[s.type];
    if (!prefix) continue;
    submissionEntries.push({
      url: `${base}${prefix}/${s.publicId}`,
      lastModified: s.updatedAt ?? s.publishedAt ?? undefined,
      changeFrequency:
        s.type === "intel" || s.type === "event" ? "weekly" : "monthly",
      priority: s.type === "intel" ? 0.7 : 0.6,
    });
  }

  // Address dossier pages — only those with at least one approved intel
  // mention. Same predicate the page itself uses to decide whether to
  // render or 404.
  const addrs = await db
    .select({
      chain: addresses.chain,
      address: addresses.address,
      latest: sql<Date | null>`max(${submissions.publishedAt})`,
    })
    .from(addresses)
    .innerJoin(intelAddresses, eq(intelAddresses.addressId, addresses.id))
    .innerJoin(submissions, eq(intelAddresses.submissionId, submissions.id))
    .where(
      and(eq(submissions.type, "intel"), eq(submissions.status, "approved")),
    )
    .groupBy(addresses.id, addresses.chain, addresses.address)
    .limit(20_000);

  const addressEntries: MetadataRoute.Sitemap = addrs.map((a) => ({
    url: `${base}/address/${a.chain}/${a.address.toLowerCase()}`,
    lastModified: a.latest ?? undefined,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [...staticEntries, ...submissionEntries, ...addressEntries];
}
