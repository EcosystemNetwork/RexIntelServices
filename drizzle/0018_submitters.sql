-- Submitter reputation: promote per-submission submitter_email/submitter_handle
-- (which are still stored on the submissions row) into a first-class
-- submitters table so we can render contributor profile pages and compute
-- accuracy scores (featured / approved). Existing submissions backfill into
-- submitter rows grouped by lower(submitter_email); anonymous submissions stay
-- unlinked (submitter_id = NULL).

CREATE TABLE IF NOT EXISTS "submitters" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  -- Stored verbatim so we can re-derive the slug if needed; uniqueness
  -- enforced via a lower(email) index below.
  "email" text NOT NULL,
  -- Whatever handle the submitter last self-identified with (or a derivation
  -- from the email local-part if they never set one). Rendered as the byline.
  "display_handle" text NOT NULL,
  -- URL slug for /contributors/[slug]. Includes a uuid-prefix suffix so we
  -- never collide and never need a collision loop in application code.
  "slug" text NOT NULL,
  -- Free-form profile copy. NULL until the contributor (or a moderator)
  -- fills it in via a future admin surface.
  "bio" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "submitters_email_idx"
  ON "submitters" (LOWER("email"));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "submitters_slug_idx"
  ON "submitters" ("slug");
--> statement-breakpoint

-- Backfill: one submitter row per unique (lower-cased) email already on file,
-- using the most-recently-submitted handle for that email. Skip rows where
-- submitter_email is NULL — those are anonymous submissions.
INSERT INTO "submitters" (id, email, display_handle, slug, created_at, updated_at)
SELECT
  gen_random_uuid() AS id,
  LOWER(grouped.email) AS email,
  COALESCE(NULLIF(TRIM(grouped.handle), ''), SPLIT_PART(grouped.email, '@', 1)) AS display_handle,
  '' AS slug,
  NOW() AS created_at,
  NOW() AS updated_at
FROM (
  SELECT DISTINCT ON (LOWER(submitter_email))
    submitter_email AS email,
    submitter_handle AS handle
  FROM submissions
  WHERE submitter_email IS NOT NULL
  ORDER BY LOWER(submitter_email), created_at DESC
) grouped
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- Populate slugs deterministically — slugify(display_handle) + uuid-prefix
-- suffix. The suffix is what guarantees uniqueness without a collision loop.
UPDATE "submitters"
SET slug = LOWER(
  REGEXP_REPLACE(
    REGEXP_REPLACE(display_handle, '[^a-zA-Z0-9]+', '-', 'g'),
    '(^-+|-+$)',
    '',
    'g'
  )
) || '-' || SUBSTRING(id::text FROM 1 FOR 6)
WHERE slug = '' OR slug IS NULL;
--> statement-breakpoint

ALTER TABLE "submissions"
  ADD COLUMN IF NOT EXISTS "submitter_id" uuid REFERENCES "submitters"("id") ON DELETE SET NULL;
--> statement-breakpoint

-- Link each existing submission to its submitter row by lower(email).
UPDATE submissions s
SET submitter_id = sub.id
FROM submitters sub
WHERE s.submitter_email IS NOT NULL
  AND LOWER(s.submitter_email) = LOWER(sub.email)
  AND s.submitter_id IS NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "submissions_submitter_id_idx"
  ON "submissions" ("submitter_id");
