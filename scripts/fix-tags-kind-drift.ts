/**
 * One-shot: adds the tags.kind column that migration 0004 originally added
 * but is missing from the current DB (drift). Unblocks 0021's seed inserts.
 * Idempotent. Doesn't touch drizzle migrations bookkeeping.
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "../src/lib/db";

(async () => {
  await db.execute(
    sql.raw(
      `DO $$ BEGIN CREATE TYPE "public"."tag_kind" AS ENUM('persona', 'interest'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
    ),
  );
  await db.execute(
    sql.raw(
      `ALTER TABLE "tags" ADD COLUMN IF NOT EXISTS "kind" "tag_kind" DEFAULT 'interest' NOT NULL;`,
    ),
  );
  console.log("✓ tags.kind ensured");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
