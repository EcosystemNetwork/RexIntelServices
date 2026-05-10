DO $$ BEGIN
 CREATE TYPE "public"."address_role" AS ENUM('subject', 'counterparty', 'observed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."tag_kind" AS ENUM('persona', 'interest');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chain" text NOT NULL,
	"address" text NOT NULL,
	"label" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "intel_addresses" (
	"submission_id" uuid NOT NULL,
	"address_id" uuid NOT NULL,
	"role" "address_role" DEFAULT 'observed' NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "intel_addresses_submission_id_address_id_pk" PRIMARY KEY("submission_id","address_id")
);
--> statement-breakpoint
ALTER TABLE "tags" ADD COLUMN "kind" "tag_kind" DEFAULT 'interest' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "intel_addresses" ADD CONSTRAINT "intel_addresses_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "intel_addresses" ADD CONSTRAINT "intel_addresses_address_id_addresses_id_fk" FOREIGN KEY ("address_id") REFERENCES "public"."addresses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "addresses_chain_addr_idx" ON "addresses" USING btree ("chain",lower("address"));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "addresses_chain_idx" ON "addresses" USING btree ("chain");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "intel_addresses_address_idx" ON "intel_addresses" USING btree ("address_id");--> statement-breakpoint
INSERT INTO "tags" ("name", "description", "kind") VALUES
  ('compliance', 'AML / compliance officers at exchanges, fintechs, banks', 'persona'),
  ('exchange-risk', 'Trust & safety / risk teams at exchanges & on-ramps', 'persona'),
  ('investigator', 'Investigators, OSINT researchers, journalists', 'persona'),
  ('gov-le', 'Government, law enforcement, regulators', 'persona'),
  ('fund-risk', 'Fund / treasury / desk risk managers', 'persona')
ON CONFLICT ("name") DO NOTHING;