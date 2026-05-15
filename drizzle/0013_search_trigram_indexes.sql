-- Search performance: ILIKE queries against payload JSONB extracts (city,
-- country, location, name, title, company, organization) drive the public
-- /search page and the per-lane location filters. Without trigram indexes
-- these scale linearly with row count. pg_trgm + GIN gives sub-linear ILIKE
-- and is cheap enough for short-text columns. The indexes are over the raw
-- JSON extract (no LOWER wrapper) because gin_trgm_ops supports ILIKE
-- directly — keeps the existing queries index-eligible without rewrites.
--
-- Description is intentionally omitted — much larger payload, lower
-- selectivity, and not yet a primary search axis. Add later if needed.

CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS submissions_payload_city_trgm
  ON "submissions" USING gin (("payload"->>'city') gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS submissions_payload_country_trgm
  ON "submissions" USING gin (("payload"->>'country') gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS submissions_payload_location_trgm
  ON "submissions" USING gin (("payload"->>'location') gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS submissions_payload_name_trgm
  ON "submissions" USING gin (("payload"->>'name') gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS submissions_payload_title_trgm
  ON "submissions" USING gin (("payload"->>'title') gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS submissions_payload_company_trgm
  ON "submissions" USING gin (("payload"->>'company') gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS submissions_payload_organization_trgm
  ON "submissions" USING gin (("payload"->>'organization') gin_trgm_ops);
