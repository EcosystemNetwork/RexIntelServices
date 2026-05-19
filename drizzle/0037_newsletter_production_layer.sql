-- 0037_newsletter_production_layer
--
-- Production-mode upgrades for the newsletter pipeline at 6k+ recipients
-- growing daily:
--   1. body_doc jsonb on campaigns         → Tiptap JSON for the WYSIWYG composer
--   2. A/B subject fields on campaigns     → subjectB + sample/winner bookkeeping
--   3. ab_variant on sends                 → which subject each recipient got
--   4. segments table + campaign FK        → named saved-segment criteria
--   5. progress fields on campaigns        → async-resumable worker visibility

ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "body_doc" jsonb;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "subject_b" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "ab_sample_size" integer;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "ab_winner_metric" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "ab_winner_picked_at" timestamp;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "ab_winner_subject" text;--> statement-breakpoint
-- progress_started_at: when the worker first claimed this send. The stuck-send
-- sweeper in dispatch-scheduled uses updatedAt for its cutoff, which can be
-- bumped by any other update; progress_started_at is dedicated.
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "progress_started_at" timestamp;--> statement-breakpoint

-- =====================================================================
-- SEGMENTS — named, saved targeting criteria. A campaign can target by
-- tag set (existing), by segment (new), or both. Segment filter shape:
--   { tagIds?: string[], statuses?: string[], personas?: string[],
--     sources?: string[], includeUnconfirmed?: boolean }
-- =====================================================================

CREATE TABLE IF NOT EXISTS "segments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "filter_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_by" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "segments" ADD CONSTRAINT "segments_created_by_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "segments_name_idx" ON "segments" ("name");--> statement-breakpoint

ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "segment_id" uuid;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_segment_id_fk"
    FOREIGN KEY ("segment_id") REFERENCES "public"."segments"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

-- =====================================================================
-- A/B variant tag on sends. 'a' or 'b' for split tests; null for normal sends.
-- Lets the analytics roll up open/click rate per variant.
-- =====================================================================

ALTER TABLE "sends" ADD COLUMN IF NOT EXISTS "ab_variant" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sends_ab_variant_idx" ON "sends" ("campaign_id", "ab_variant");
