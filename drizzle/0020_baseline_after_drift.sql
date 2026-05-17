ALTER TYPE "submission_type" ADD VALUE 'fellowship';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "submitters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_handle" text NOT NULL,
	"slug" text NOT NULL,
	"bio" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vote_tokens" RENAME COLUMN "token" TO "token_hash";--> statement-breakpoint
ALTER TABLE "monthly_prizes" DROP CONSTRAINT "monthly_prizes_settled_by_users_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "vote_tokens_token_idx";--> statement-breakpoint
ALTER TABLE "monthly_prizes" ALTER COLUMN "pool_balance_at_settle" SET DATA TYPE numeric(38, 6);--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "edit_token_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "submitter_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "submitters_email_idx" ON "submitters" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "submitters_slug_idx" ON "submitters" USING btree ("slug");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "monthly_prizes" ADD CONSTRAINT "monthly_prizes_settled_by_users_id_fk" FOREIGN KEY ("settled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "submissions" ADD CONSTRAINT "submissions_submitter_id_submitters_id_fk" FOREIGN KEY ("submitter_id") REFERENCES "public"."submitters"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "submissions_submitter_id_idx" ON "submissions" USING btree ("submitter_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vote_tokens_token_hash_idx" ON "vote_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vote_tokens_expires_at_idx" ON "vote_tokens" USING btree ("expires_at");