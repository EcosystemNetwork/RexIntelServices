import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

/**
 * Public crawl policy. Allow most paths; disallow the admin and API
 * surfaces so search engines don't waste crawl budget on auth-walled or
 * non-indexable endpoints.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/dashboard", "/campaigns", "/subscribers", "/submissions", "/tags", "/suppressions", "/login"],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
    host: siteUrl(),
  };
}
