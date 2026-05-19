import "dotenv/config";
import { and, eq, sql, desc } from "drizzle-orm";
import { db, submissions } from "../src/lib/db";

async function main() {
  // Breakdown by source
  const bySource = await db.execute<{
    src: string | null;
    n: number;
    total: string;
  }>(sql`
    SELECT coalesce(${submissions.payload}->>'sourceHarvester', '(null)') AS src,
           count(*)::int AS n,
           coalesce(sum((${submissions.payload}->>'lossUsd')::numeric), 0)::text AS total
    FROM ${submissions}
    WHERE ${submissions.type} = 'intel'
      AND ${submissions.status} = 'approved'
      AND ${submissions.payload}->>'kind' = 'incident'
      AND (${submissions.payload}->>'lossUsd') IS NOT NULL
      AND (${submissions.payload}->>'lossUsd')::numeric > 0
    GROUP BY 1
    ORDER BY 3 DESC
  `);
  console.log("BY SOURCE:");
  for (const r of bySource.rows as Array<{ src: string; n: number; total: string }>) {
    const total = Number(r.total);
    console.log(`  ${r.src.padEnd(20)} n=${r.n}  $${(total / 1e9).toFixed(3)}B`);
  }

  // Find duplicate-looking incidents — by 7-token title prefix match across sources
  const dupes = await db.execute<{
    name_key: string;
    sources: string;
    losses: string;
    n: number;
  }>(sql`
    WITH inc AS (
      SELECT
        ${submissions.publicId} AS public_id,
        ${submissions.payload}->>'headline' AS headline,
        coalesce(${submissions.payload}->>'sourceHarvester', '(null)') AS src,
        (${submissions.payload}->>'lossUsd')::numeric AS loss,
        regexp_replace(
          lower(split_part(${submissions.payload}->>'headline', ' ', 1)),
          '[^a-z0-9]', '', 'g'
        ) AS name_key
      FROM ${submissions}
      WHERE ${submissions.type} = 'intel'
        AND ${submissions.status} = 'approved'
        AND ${submissions.payload}->>'kind' = 'incident'
        AND (${submissions.payload}->>'lossUsd') IS NOT NULL
        AND (${submissions.payload}->>'lossUsd')::numeric > 0
    )
    SELECT name_key,
           string_agg(distinct src, ', ') AS sources,
           string_agg(headline || ' [$' || (loss/1e6)::int || 'M, src=' || src || ']', E'\n    ') AS losses,
           count(*)::int AS n
    FROM inc
    GROUP BY name_key
    HAVING count(*) > 1
    ORDER BY count(*) DESC, name_key
    LIMIT 30
  `);
  console.log("\nDUPES (by first-word match, n>1):");
  for (const r of dupes.rows as Array<{
    name_key: string;
    sources: string;
    losses: string;
    n: number;
  }>) {
    console.log(`  [${r.name_key}] n=${r.n}, sources=${r.sources}`);
    console.log(`    ${r.losses}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
