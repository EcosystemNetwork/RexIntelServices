-- 0024_submitter_login_analytics
--
-- Adds login telemetry to `submitters` so the admin panel can show how often
-- each Circle-authenticated contributor signs back in. login_count is bumped
-- on every successful createCircleSession; last_login_at gets the timestamp
-- of the most recent mint. Both columns are nullable-safe for legacy rows.

ALTER TABLE "submitters" ADD COLUMN IF NOT EXISTS "login_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "submitters" ADD COLUMN IF NOT EXISTS "last_login_at" timestamp;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "submitters_last_login_idx" ON "submitters" ("last_login_at");
