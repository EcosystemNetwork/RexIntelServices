-- =====================================================================
-- Magic Link auth — replaces Circle programmable wallets for contributor
-- sign-in. Magic dedicated wallets are still email-onboarded and PIN-free
-- (Magic handles the key custody), but each user gets a stable Magic
-- "issuer" DID (e.g. did:ethr:0x...) that we store as the canonical handle
-- for that contributor's Magic account.
--
-- This migration only adds the new column + index. The legacy
-- `circle_user_id` column is left in place for the rollover so the column
-- can be dropped in a follow-up once no row references Circle exclusively.
-- =====================================================================

ALTER TABLE "submitters" ADD COLUMN IF NOT EXISTS "magic_issuer" text;

CREATE UNIQUE INDEX IF NOT EXISTS "submitters_magic_issuer_idx"
  ON "submitters" ("magic_issuer")
  WHERE "magic_issuer" IS NOT NULL;
