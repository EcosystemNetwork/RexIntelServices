DO $$ BEGIN
 CREATE TYPE "public"."address_attribution_source" AS ENUM('ofac', 'ofsi', 'eu-sanctions', 'defillama', 'rexintel-curated', 'rexintel-community', 'etherscan', 'incident');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."address_category" AS ENUM('exchange', 'defi-protocol', 'treasury', 'foundation', 'bridge', 'mixer', 'sanctioned', 'government-seized', 'lost', 'dormant', 'hack-source', 'hack-destination', 'validator', 'personality', 'market-maker', 'mev-bot', 'scam');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."address_owner_kind" AS ENUM('exchange', 'dao', 'foundation', 'government', 'individual', 'protocol', 'market-maker', 'criminal-group', 'estate', 'unknown');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "address_attributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"address_id" uuid NOT NULL,
	"source" "address_attribution_source" NOT NULL,
	"source_ref" text,
	"source_url" text,
	"category" "address_category",
	"owner_name" text,
	"owner_kind" "address_owner_kind",
	"label" text,
	"notes" text,
	"confidence" integer,
	"reported_at" timestamp,
	"harvested_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "addresses" ADD COLUMN "category" "address_category";--> statement-breakpoint
ALTER TABLE "addresses" ADD COLUMN "owner_name" text;--> statement-breakpoint
ALTER TABLE "addresses" ADD COLUMN "owner_kind" "address_owner_kind";--> statement-breakpoint
ALTER TABLE "addresses" ADD COLUMN "primary_source" "address_attribution_source";--> statement-breakpoint
ALTER TABLE "addresses" ADD COLUMN "confidence" integer;--> statement-breakpoint
ALTER TABLE "addresses" ADD COLUMN "balance_estimate_usd" numeric(18, 2);--> statement-breakpoint
ALTER TABLE "addresses" ADD COLUMN "first_seen_at" timestamp;--> statement-breakpoint
ALTER TABLE "addresses" ADD COLUMN "last_verified_at" timestamp;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "address_attributions" ADD CONSTRAINT "address_attributions_address_id_addresses_id_fk" FOREIGN KEY ("address_id") REFERENCES "public"."addresses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "address_attributions_address_idx" ON "address_attributions" USING btree ("address_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "address_attributions_source_idx" ON "address_attributions" USING btree ("source");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "address_attributions_addr_source_ref_idx" ON "address_attributions" USING btree ("address_id","source","source_ref") NULLS NOT DISTINCT;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "addresses_category_idx" ON "addresses" USING btree ("category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "addresses_owner_kind_idx" ON "addresses" USING btree ("owner_kind");