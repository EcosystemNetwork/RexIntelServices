-- 0038_forensic_cases.sql
-- RexIntel ForensicAgent — public investigation cases. Records the target,
-- the agent's final structured report (JSONB) and the full transcript of
-- tool calls + results (JSONB array) so the public /forensic/[caseId] page
-- can render an auditable chain of reasoning end-to-end.
--
-- Hand-written to avoid drizzle-kit bundling drifted ALTER TABLE statements
-- from prior migrations (journal/file count > applied count drift).

CREATE TABLE IF NOT EXISTS "forensic_cases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "public_id" text DEFAULT encode(gen_random_bytes(8), 'hex') NOT NULL,
  "target_kind" text NOT NULL,
  "target" text NOT NULL,
  "chain" text,
  "submitter_email" text,
  "submitter_ip" text,
  "status" text DEFAULT 'pending' NOT NULL,
  "failure_reason" text,
  "max_iterations" integer DEFAULT 12 NOT NULL,
  "iterations_used" integer DEFAULT 0 NOT NULL,
  "tool_call_count" integer DEFAULT 0 NOT NULL,
  "model_id" text,
  "report" jsonb,
  "transcript" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "started_at" timestamp,
  "completed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "forensic_cases_public_id_idx" ON "forensic_cases" USING btree ("public_id");
CREATE INDEX IF NOT EXISTS "forensic_cases_status_idx" ON "forensic_cases" USING btree ("status");
CREATE INDEX IF NOT EXISTS "forensic_cases_target_idx" ON "forensic_cases" USING btree ("target_kind", "target");
CREATE INDEX IF NOT EXISTS "forensic_cases_created_idx" ON "forensic_cases" USING btree ("created_at");
