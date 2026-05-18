-- 0027_loss_reports
--
-- User-reported lost / stolen assets. Three concerns:
--   1. New submission `type = 'loss_report'` — distinct from intel so the
--      editorial bar / digest cron / OG kicker aren't polluted with victim
--      reports (firsthand testimony, not journalism).
--   2. New attribution source `community-loss-report` — lowest precedence;
--      hidden by default on /graph so a sanctions/curated row never gets
--      visually downgraded by a victim's claim against the same address.
--   3. New contribution kind `loss_report_accepted` — small (+3) award so
--      victims still earn rep on approval without out-paying real intel.
--
-- Plus a `submissions.graph_attribution_status` column to gate write-to-graph
-- on submitter tier. open-tier submitters' approved reports queue here and
-- get written when they cross to contributor (one verified contribution).
-- Anonymous reports and ≥contributor-tier reports write immediately.

ALTER TYPE "submission_type" ADD VALUE IF NOT EXISTS 'loss_report';--> statement-breakpoint
ALTER TYPE "address_attribution_source" ADD VALUE IF NOT EXISTS 'community-loss-report';--> statement-breakpoint
ALTER TYPE "contribution_event_kind" ADD VALUE IF NOT EXISTS 'loss_report_accepted';--> statement-breakpoint

-- NULL for non-loss-report rows. For loss_report rows: 'queued' until the
-- submitter's tier crosses contributor (or curator overrides), then 'written'.
-- 'rejected_low_tier' is reserved for a future curator-flagged-bad path; not
-- written today.
ALTER TABLE "submissions" ADD COLUMN IF NOT EXISTS "graph_attribution_status" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "submissions_graph_attribution_status_idx" ON "submissions" USING btree ("graph_attribution_status") WHERE "graph_attribution_status" IS NOT NULL;
