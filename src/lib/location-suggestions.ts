import { sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db, submissions } from "@/lib/db";

/**
 * Distinct location strings observed across approved submissions — fed into a
 * `<datalist>` for native browser autocomplete on the various `loc=` inputs.
 *
 * Pulls from three payload keys because submission types are inconsistent:
 *   - `city`       (events, hackathons, popup_city, residency)
 *   - `country`    (same set)
 *   - `location`   (jobs, accelerator, capital — free-form)
 *
 * Capped at 250 values so the rendered HTML stays small. The cache TTL is
 * generous because the suggestion set churns slowly (new submissions arrive
 * a few times per day).
 */
export const getLocationSuggestions = unstable_cache(
  async (): Promise<string[]> => {
    const rows = await db.execute<{ v: string }>(sql`
      SELECT DISTINCT v FROM (
        SELECT TRIM(${submissions.payload}->>'city')     AS v FROM ${submissions} WHERE ${submissions.status} = 'approved'
        UNION ALL
        SELECT TRIM(${submissions.payload}->>'country')  AS v FROM ${submissions} WHERE ${submissions.status} = 'approved'
        UNION ALL
        SELECT TRIM(${submissions.payload}->>'location') AS v FROM ${submissions} WHERE ${submissions.status} = 'approved'
      ) t
      WHERE v IS NOT NULL AND v <> ''
      ORDER BY v ASC
      LIMIT 250
    `);
    // drizzle's execute returns either rows directly or an object with `.rows`
    // depending on driver. Normalize.
    const list = Array.isArray(rows)
      ? rows
      : (rows as unknown as { rows: { v: string }[] }).rows;
    return list.map((r) => r.v).filter(Boolean);
  },
  ["location-suggestions-v1"],
  { revalidate: 600 }, // 10 minutes
);
