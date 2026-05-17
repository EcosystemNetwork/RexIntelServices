CREATE TABLE IF NOT EXISTS "intel_votes" (
	"submission_id" uuid NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"voted_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "intel_votes_submission_id_subscriber_id_pk" PRIMARY KEY("submission_id","subscriber_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "monthly_prizes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year_month" text NOT NULL,
	"pool_balance_at_settle" numeric(38, 6) NOT NULL,
	"pool_currency" text DEFAULT 'USDC' NOT NULL,
	"pool_chain" text DEFAULT 'base' NOT NULL,
	"payouts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"settled_at" timestamp,
	"settled_by" uuid,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "monthly_prizes_year_month_format" CHECK (year_month ~ '^\d{4}-(0[1-9]|1[0-2])$')
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vote_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"email" text NOT NULL,
	"submission_id" uuid NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"ip_address" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "intel_votes" ADD CONSTRAINT "intel_votes_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "intel_votes" ADD CONSTRAINT "intel_votes_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "monthly_prizes" ADD CONSTRAINT "monthly_prizes_settled_by_users_id_fk" FOREIGN KEY ("settled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "vote_tokens" ADD CONSTRAINT "vote_tokens_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- Editorial-bar guard: the draft-digest cron only fires when ≥1 approved intel
-- has kind ∈ {original,incident}. NOT VALID so existing rows that predate the
-- `kind` field (which default to "tip" in code) don't block the migration.
DO $$ BEGIN
 ALTER TABLE "submissions" ADD CONSTRAINT "submissions_intel_kind_check"
   CHECK (
     type <> 'intel'
     OR (payload->>'kind') IS NULL
     OR (payload->>'kind') IN ('tip', 'original', 'incident')
   ) NOT VALID;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "intel_votes_subscriber_idx" ON "intel_votes" USING btree ("subscriber_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "intel_votes_voted_at_idx" ON "intel_votes" USING btree ("voted_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "monthly_prizes_year_month_idx" ON "monthly_prizes" USING btree ("year_month");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vote_tokens_token_hash_idx" ON "vote_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vote_tokens_email_submission_idx" ON "vote_tokens" USING btree ("email","submission_id");--> statement-breakpoint
-- Supports the periodic cleanup of expired tokens (TTL sweep) — without
-- this the sweep would seq-scan every row in vote_tokens.
CREATE INDEX IF NOT EXISTS "vote_tokens_expires_at_idx" ON "vote_tokens" USING btree ("expires_at");
