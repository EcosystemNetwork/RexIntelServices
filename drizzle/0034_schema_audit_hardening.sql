-- Pre-mainnet schema hardening from the security audit.
-- Each change is independently revertable; ordered so partial-apply during
-- a deploy still leaves the DB internally consistent.

-- =====================================================================
-- 1. subscribers.email: case-insensitive uniqueness
--
-- The previous index was on the raw `email` column. /api/subscribe and
-- /api/subscribers POST both lowercase before insert, but defense-in-depth
-- requires the DB to enforce the case-folded uniqueness. Without this,
-- ALICE@x.com and alice@x.com both insert successfully if any future path
-- skips the lowercase step (e.g. a manual SQL insert, a future API
-- onboarding flow, an import that forgets to lowercase).
-- =====================================================================
DROP INDEX IF EXISTS "subscribers_email_idx";
CREATE UNIQUE INDEX "subscribers_email_idx" ON "subscribers" (lower("email"));

-- =====================================================================
-- 2. submitters: partial unique on email + circle_user_id
--
-- Postgres treats multiple NULLs as distinct in regular unique indexes,
-- so a nullable column with `unique` allows unlimited NULL rows — a
-- future bug path that inserts a submitter without an email or
-- circleUserId could write unlimited rows. Partial unique with the
-- IS NOT NULL guard preserves the dedup intent while leaving nullable
-- semantics for the column itself.
-- =====================================================================
DROP INDEX IF EXISTS "submitters_email_idx";
CREATE UNIQUE INDEX "submitters_email_idx"
  ON "submitters" (lower("email"))
  WHERE "email" IS NOT NULL;

DROP INDEX IF EXISTS "submitters_circle_user_idx";
CREATE UNIQUE INDEX "submitters_circle_user_idx"
  ON "submitters" ("circle_user_id")
  WHERE "circle_user_id" IS NOT NULL;

-- =====================================================================
-- 3. submitters: ban-implies-strikes CHECK
--
-- The 2-strike permanent-ban is doctrine (project_bounty_bad_faith_policy).
-- App code in applyClaimReview enforces it, but a future maintenance
-- query that zeroes out bountyStrikes (e.g. for an erroneous strike that
-- should be retracted) would silently lift the ban. The DB enforces the
-- invariant so the data model can't drift.
-- =====================================================================
ALTER TABLE "submitters"
  ADD CONSTRAINT "submitters_ban_implies_strikes"
  CHECK (("bounty_banned_at" IS NULL) OR ("bounty_strikes" >= 2));

-- =====================================================================
-- 4. hack_traces: dedupe partial unique on (chain, root, email)
--
-- The /api/trace route now dedupes in app code within a 24h window, but
-- the DB had no constraint. A botnet could still race the dedupe window
-- and insert duplicates. Partial unique with the live-status filter
-- collapses the race to a single row server-side. Excludes 'failed' so a
-- second attempt after a transient failure can succeed.
-- =====================================================================
CREATE UNIQUE INDEX IF NOT EXISTS "hack_traces_chain_root_email_idx"
  ON "hack_traces" (
    "chain",
    lower("root_address"),
    lower("submitter_email")
  )
  WHERE "status" IN ('pending', 'running', 'complete');

-- =====================================================================
-- 5. circle_webhook_deliveries: confirm the dedupe table exists
--
-- 0033 already created this; the IF NOT EXISTS makes this migration
-- safe to apply against environments where 0033 was skipped or where
-- the table was hand-created out of band.
-- =====================================================================
CREATE TABLE IF NOT EXISTS "circle_webhook_deliveries" (
  "notification_id" text PRIMARY KEY,
  "notification_type" text,
  "transaction_id" text,
  "received_at" timestamp DEFAULT now() NOT NULL
);
