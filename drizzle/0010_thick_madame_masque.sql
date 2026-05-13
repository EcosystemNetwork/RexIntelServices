ALTER TABLE "submissions" ADD COLUMN "event_ends_at" timestamp;--> statement-breakpoint
UPDATE "submissions"
SET "event_ends_at" = ("payload"->>'endsAt')::timestamptz
WHERE "event_ends_at" IS NULL
  AND "payload" ? 'endsAt'
  AND "payload"->>'endsAt' <> '';