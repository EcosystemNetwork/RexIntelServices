-- Add an explicit expiry to edit_token. NULL = never expires, which keeps
-- every existing tokenized edit link in the wild (already emailed to
-- submitters) working indefinitely. New submissions created after this
-- migration get an expiry set in /api/submit (default: 1 year from creation).
--
-- Index over expires_at lets the future cleanup job drop expired rows in a
-- bounded scan if we ever decide to GC them.

ALTER TABLE "submissions"
  ADD COLUMN IF NOT EXISTS "edit_token_expires_at" timestamp;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "submissions_edit_token_expires_at_idx"
  ON "submissions" USING btree ("edit_token_expires_at");
