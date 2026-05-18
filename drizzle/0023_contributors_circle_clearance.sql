DO $$ BEGIN
 CREATE TYPE "public"."clearance_tier" AS ENUM('open', 'contributor', 'trusted', 'inner_circle');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."contribution_event_kind" AS ENUM('incident_accepted', 'original_accepted', 'tip_accepted', 'event_scoop_accepted', 'event_paste_accepted', 'address_tag_accepted', 'vote_cast', 'prize_win_first', 'prize_win_second', 'prize_win_third', 'curator_award', 'retraction_clawback');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "submitters" ALTER COLUMN "email" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "submitters" ALTER COLUMN "display_handle" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "submitters" ADD COLUMN IF NOT EXISTS "circle_user_id" text;
--> statement-breakpoint
ALTER TABLE "submitters" ADD COLUMN IF NOT EXISTS "wallet_address" text;
--> statement-breakpoint
ALTER TABLE "submitters" ADD COLUMN IF NOT EXISTS "wallet_chain" text DEFAULT 'ethereum';
--> statement-breakpoint
ALTER TABLE "submitters" ADD COLUMN IF NOT EXISTS "points" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "submitters" ADD COLUMN IF NOT EXISTS "clearance_tier" "clearance_tier" DEFAULT 'open' NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "submitters_circle_user_idx" ON "submitters" ("circle_user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "submitters_wallet_idx" ON "submitters" (lower("wallet_address"));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "submitters_points_idx" ON "submitters" ("points");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "submitters" ADD CONSTRAINT "submitters_email_or_wallet_required" CHECK ("email" IS NOT NULL OR "wallet_address" IS NOT NULL);
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contribution_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submitter_id" uuid NOT NULL,
	"kind" "contribution_event_kind" NOT NULL,
	"points" integer NOT NULL,
	"submission_id" uuid,
	"awarded_by_user_id" uuid,
	"notes" text,
	"awarded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contribution_events" ADD CONSTRAINT "contribution_events_submitter_id_submitters_id_fk" FOREIGN KEY ("submitter_id") REFERENCES "public"."submitters"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contribution_events" ADD CONSTRAINT "contribution_events_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contribution_events" ADD CONSTRAINT "contribution_events_awarded_by_user_id_users_id_fk" FOREIGN KEY ("awarded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contribution_events_submitter_idx" ON "contribution_events" ("submitter_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contribution_events_submitter_awarded_idx" ON "contribution_events" ("submitter_id","awarded_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contribution_events_submission_idx" ON "contribution_events" ("submission_id");
