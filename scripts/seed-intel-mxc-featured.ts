/**
 * Run with: npx tsx scripts/seed-intel-mxc-featured.ts
 *
 * Promotes the existing MXC / MatchX 'Moonchain' transition postmortem to the
 * 6th featured /intel piece, alongside casper / despark / oriolo / pink-drainer
 * / github-key-sweeper.
 *
 * Per Rex directive 2026-05-19: featured=true, spicy NOT set. The row's body
 * and payload live in seed-intel-incidents.ts (canonical); this script only
 * toggles the featured column on the existing row (no payload edits).
 *
 * Prereq: seed-intel-incidents.ts must have been run at least once so the
 * MXC row exists. Idempotent — re-runnable.
 */
import "dotenv/config";
import { and, eq, sql } from "drizzle-orm";
import { db, submissions } from "../src/lib/db";

const HEADLINE_PREFIX = "MXC / MatchX 'Moonchain' transition";

async function main() {
  const rows = await db
    .select({
      id: submissions.id,
      publicId: submissions.publicId,
      featured: submissions.featured,
    })
    .from(submissions)
    .where(
      and(
        eq(submissions.type, "intel"),
        sql`${submissions.payload}->>'headline' LIKE ${`${HEADLINE_PREFIX}%`}`,
      ),
    )
    .limit(1);

  if (!rows.length) {
    console.error(
      `No /intel row matches headline prefix "${HEADLINE_PREFIX}". Run scripts/seed-intel-incidents.ts first.`,
    );
    process.exit(1);
  }

  const row = rows[0];

  if (row.featured) {
    console.log(`ALREADY  id=${row.id}  publicId=${row.publicId}  featured=true`);
    console.log(`         /intel/${row.publicId}`);
    return;
  }

  await db
    .update(submissions)
    .set({ featured: true, updatedAt: new Date() })
    .where(eq(submissions.id, row.id));

  console.log(`UPDATED  id=${row.id}  publicId=${row.publicId}  featured=true`);
  console.log(`         /intel/${row.publicId}`);
  console.log(`         featured=true  spicy=(omitted)  slot=6th`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
