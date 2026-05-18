/**
 * One-shot: adds native_amount (numeric) + native_symbol (text) to the
 * addresses table. Idempotent. Lets the value-counter break down by token
 * ("X BTC lost / Y ETH frozen") alongside the USD total.
 *
 * Same pattern as scripts/apply-0022-addresses.ts — applied directly so we
 * don't have to wait on the in-progress drizzle-kit migration cleanup.
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "../src/lib/db";

(async () => {
  await db.execute(
    sql.raw(
      `ALTER TABLE "addresses" ADD COLUMN IF NOT EXISTS "native_amount" numeric(38, 8);`,
    ),
  );
  await db.execute(
    sql.raw(`ALTER TABLE "addresses" ADD COLUMN IF NOT EXISTS "native_symbol" text;`),
  );
  await db.execute(
    sql.raw(
      `CREATE INDEX IF NOT EXISTS "addresses_native_symbol_idx" ON "addresses" USING btree ("native_symbol");`,
    ),
  );
  console.log("✓ native_amount + native_symbol columns ensured");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
