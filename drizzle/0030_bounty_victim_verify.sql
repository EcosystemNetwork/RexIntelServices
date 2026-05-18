-- 0030_bounty_victim_verify
--
-- Closes the audit findings on the recovery-bounty surface:
--
--   #5  Free-standing bounty creation accepted a victimEmail with no
--       proof of ownership. New victim_verified_at column gates the
--       draft → open transition: a draft can be created and funded, but
--       won't become publicly visible until the victim verifies their
--       email (via Circle session match at create time OR an email-OTP
--       round after create).
--
--   #6  Anon victims (no Circle account) couldn't access their own draft
--       because the visibility check required a session-submitter match.
--       New victim_access_token_hash gives the creator a one-shot raw
--       token (returned only in the create response and surfaced in the
--       funding-instructions email) that grants draft access via ?token=
--       without any session. SHA-256 in the DB so a snapshot leak does
--       not yield working tokens.
--
-- victim_verified_at is the load-bearing field for publication; the
-- access token is purely a draft-viewing credential. Verified victims
-- can also still pass the token to share their own draft with
-- collaborators before publication.

ALTER TABLE "bounties" ADD COLUMN IF NOT EXISTS "victim_verified_at" timestamp;--> statement-breakpoint
ALTER TABLE "bounties" ADD COLUMN IF NOT EXISTS "victim_access_token_hash" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bounties_victim_verified_idx" ON "bounties" USING btree ("victim_verified_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bounties_victim_token_hash_idx" ON "bounties" USING btree ("victim_access_token_hash");
