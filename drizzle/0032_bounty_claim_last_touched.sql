-- 0032_bounty_claim_last_touched
--
-- Adds `last_touched_at` to bounty_claims. Bumped any time the row's
-- status or curator notes change; serves as the "oldest-needing-attention"
-- sort key for the admin curator queue.
--
-- Default = submittedAt for existing rows so nothing sorts to "infinitely
-- old". Maintained at app level by applyClaimReview() + needs-info edits.

ALTER TABLE "bounty_claims" ADD COLUMN IF NOT EXISTS "last_touched_at" timestamp NOT NULL DEFAULT now();--> statement-breakpoint
UPDATE "bounty_claims" SET "last_touched_at" = COALESCE("reviewed_at", "submitted_at") WHERE "last_touched_at" = "submitted_at" IS NOT TRUE;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bounty_claims_last_touched_idx" ON "bounty_claims" USING btree ("last_touched_at");
