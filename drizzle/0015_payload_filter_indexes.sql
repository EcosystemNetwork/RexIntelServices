-- Targeted btree expression indexes for exact-equality JSONB filters that the
-- public listing pages run on every request. These are NOT search/ILIKE
-- workloads (those are covered by the pg_trgm GIN indexes in 0013) — they're
-- low-cardinality discriminators used to slice the submissions table.
--
-- All indexes are filtered to status='approved' since that's the only status
-- the public pages query for, which keeps the indexes small (pending/rejected
-- rows don't pollute the b-tree) and lets PG plan straight to an index-only
-- path for the most common shape: (type=X, status='approved', payload-field=Y).
--
-- The hackathons page extra-filters events by payload.eventType='hackathon',
-- the intel SignalsLane filters by payload.severity and payload.category,
-- and the jobs page filters by payload.remote / payload.seniority. None of
-- those columns has an index today.
--
-- Built with CONCURRENTLY so the index build doesn't ACCESS EXCLUSIVE lock
-- the submissions table (our hottest write table). Drizzle runs each
-- statement-breakpoint chunk on its own — CONCURRENTLY needs autocommit and
-- cannot run inside an explicit transaction, which is why each statement
-- stands alone here.

CREATE INDEX CONCURRENTLY IF NOT EXISTS submissions_payload_event_type_idx
  ON "submissions" (("payload"->>'eventType'))
  WHERE status = 'approved';
--> statement-breakpoint

CREATE INDEX CONCURRENTLY IF NOT EXISTS submissions_payload_severity_idx
  ON "submissions" (("payload"->>'severity'))
  WHERE status = 'approved' AND type = 'intel';
--> statement-breakpoint

CREATE INDEX CONCURRENTLY IF NOT EXISTS submissions_payload_category_idx
  ON "submissions" (("payload"->>'category'))
  WHERE status = 'approved' AND type = 'intel';
--> statement-breakpoint

CREATE INDEX CONCURRENTLY IF NOT EXISTS submissions_payload_remote_idx
  ON "submissions" ((("payload"->>'remote')::boolean))
  WHERE status = 'approved' AND type = 'job';
--> statement-breakpoint

CREATE INDEX CONCURRENTLY IF NOT EXISTS submissions_payload_seniority_idx
  ON "submissions" (("payload"->>'seniority'))
  WHERE status = 'approved' AND type = 'job';

-- Note: an earlier draft of this migration indexed
--   (("payload"->>'expiresAt')::timestamptz)
-- but Postgres rejects timestamptz-from-text in index expressions
-- because timestamptz parsing is STABLE (depends on session timezone),
-- not IMMUTABLE. Skipping the expires-at index for now — the jobs page
-- can sequential-scan until row count makes that painful. Add later
-- via a generated stored column or a dedicated DATE column if needed.
