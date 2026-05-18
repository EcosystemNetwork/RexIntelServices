/**
 * One-shot: apply migration 0022's address-table parts only.
 * Idempotent (ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS,
 * DO $$ ... EXCEPTION WHEN duplicate_object for enums/constraints).
 *
 * Needed because drizzle-kit migrate is currently blocked on an unrelated
 * 0021 issue ("kind of relation tags doesn't exist"). This unblocks the
 * address-graph seed work without touching migrations bookkeeping.
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "../src/lib/db";

const stmts: string[] = [
  `DO $$ BEGIN CREATE TYPE "public"."address_attribution_source" AS ENUM('ofac', 'ofsi', 'eu-sanctions', 'defillama', 'rexintel-curated', 'rexintel-community', 'etherscan', 'incident'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN CREATE TYPE "public"."address_category" AS ENUM('exchange', 'defi-protocol', 'treasury', 'foundation', 'bridge', 'mixer', 'sanctioned', 'government-seized', 'lost', 'dormant', 'hack-source', 'hack-destination', 'validator', 'personality', 'market-maker', 'mev-bot', 'scam'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN CREATE TYPE "public"."address_owner_kind" AS ENUM('exchange', 'dao', 'foundation', 'government', 'individual', 'protocol', 'market-maker', 'criminal-group', 'estate', 'unknown'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `CREATE TABLE IF NOT EXISTS "address_attributions" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "address_id" uuid NOT NULL, "source" "address_attribution_source" NOT NULL, "source_ref" text, "source_url" text, "category" "address_category", "owner_name" text, "owner_kind" "address_owner_kind", "label" text, "notes" text, "confidence" integer, "reported_at" timestamp, "harvested_at" timestamp DEFAULT now() NOT NULL);`,
  `ALTER TABLE "addresses" ADD COLUMN IF NOT EXISTS "category" "address_category";`,
  `ALTER TABLE "addresses" ADD COLUMN IF NOT EXISTS "owner_name" text;`,
  `ALTER TABLE "addresses" ADD COLUMN IF NOT EXISTS "owner_kind" "address_owner_kind";`,
  `ALTER TABLE "addresses" ADD COLUMN IF NOT EXISTS "primary_source" "address_attribution_source";`,
  `ALTER TABLE "addresses" ADD COLUMN IF NOT EXISTS "confidence" integer;`,
  `ALTER TABLE "addresses" ADD COLUMN IF NOT EXISTS "balance_estimate_usd" numeric(18, 2);`,
  `ALTER TABLE "addresses" ADD COLUMN IF NOT EXISTS "first_seen_at" timestamp;`,
  `ALTER TABLE "addresses" ADD COLUMN IF NOT EXISTS "last_verified_at" timestamp;`,
  `DO $$ BEGIN ALTER TABLE "address_attributions" ADD CONSTRAINT "address_attributions_address_id_addresses_id_fk" FOREIGN KEY ("address_id") REFERENCES "public"."addresses"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `CREATE INDEX IF NOT EXISTS "address_attributions_address_idx" ON "address_attributions" USING btree ("address_id");`,
  `CREATE INDEX IF NOT EXISTS "address_attributions_source_idx" ON "address_attributions" USING btree ("source");`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "address_attributions_addr_source_ref_idx" ON "address_attributions" USING btree ("address_id","source","source_ref") NULLS NOT DISTINCT;`,
  `CREATE INDEX IF NOT EXISTS "addresses_category_idx" ON "addresses" USING btree ("category");`,
  `CREATE INDEX IF NOT EXISTS "addresses_owner_kind_idx" ON "addresses" USING btree ("owner_kind");`,
];

(async () => {
  for (const s of stmts) {
    await db.execute(sql.raw(s));
    console.log("  ok:", s.slice(0, 80));
  }
  console.log("\n✓ migration 0022 address parts applied");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
