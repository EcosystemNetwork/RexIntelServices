-- 0029_recovery_bounties
--
-- White-hat recovery bounties. Victims who run /trace can post a USDC-on-Base
-- bounty for information that leads to fund recovery (or, with a filed police
-- report, arrest). Trusted-tier contributors submit claims with sealed
-- evidence packages; curator adjudicates; payouts flow through the same
-- custodial Circle wallet rail the monthly prize pool uses.
--
-- Five concerns in this migration:
--   1. New attribution source `bounty-claim` — addresses pinned in accepted
--      claims land in the moat layer as community-derived evidence.
--   2. New contribution kind `bounty_claim_accepted` — successful white-hat
--      claims pay 75 points (between original=15 and incident=50, but
--      below curator_award territory).
--   3. Strike columns on `submitters` — bounty-specific moderation surface,
--      separate from the general clearance freeze so a bad-faith bounty
--      claimant can still submit intel.
--   4. New tables `bounties`, `bounty_claims`, `bounty_payouts` with their
--      enums.
--   5. CHECK constraints so a recovery-kind bounty must carry a percent and
--      a flat-kind bounty must carry a flat amount.

ALTER TYPE "address_attribution_source" ADD VALUE IF NOT EXISTS 'bounty-claim';--> statement-breakpoint
ALTER TYPE "contribution_event_kind" ADD VALUE IF NOT EXISTS 'bounty_claim_accepted';--> statement-breakpoint

-- Per project_bounty_bad_faith_policy.md: cap is 2 strikes before permanent
-- ban from the bounty surface. Tracked on submitters so the gate is one
-- column lookup at claim-time.
ALTER TABLE "submitters" ADD COLUMN IF NOT EXISTS "bounty_strikes" integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "submitters" ADD COLUMN IF NOT EXISTS "bounty_banned_at" timestamp;--> statement-breakpoint

-- =====================================================================
-- ENUMS
-- =====================================================================

DO $$ BEGIN
 CREATE TYPE "bounty_status" AS ENUM (
   'draft',         -- victim created, not yet funded
   'funded',        -- USDC arrived in the custodial escrow wallet
   'open',          -- accepting claims
   'adjudicating',  -- at least one claim under curator review
   'paid',          -- payout complete (full or partial)
   'refunded',      -- expired or cancelled; victim refunded
   'expired'        -- past expires_at with no valid claims
 );
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
 CREATE TYPE "bounty_kind" AS ENUM (
   'recovery',       -- pays % of recovered funds returned to victim
   'info_recovery',  -- flat USDC for info that leads to recovery
   'info_arrest'     -- flat USDC, requires victim's police-report attestation
 );
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
 CREATE TYPE "bounty_claim_status" AS ENUM (
   'submitted',
   'under_review',
   'needs_info',
   'accepted',
   'partial',     -- partial payout (e.g., partial recovery confirmed)
   'rejected',
   'withdrawn'
 );
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

-- Rejection reasons split into no-strike vs. strike. The first three are
-- good-faith failures (no penalty); the last two issue a strike. Hitting
-- 2 strikes → bounty_banned_at set, claimant blocked from POSTing claims.
DO $$ BEGIN
 CREATE TYPE "bounty_claim_rejection_reason" AS ENUM (
   'insufficient_evidence',
   'duplicate',
   'out_of_scope',
   'bad_faith',
   'doxx_attempt'
 );
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

-- =====================================================================
-- BOUNTIES
-- =====================================================================

CREATE TABLE IF NOT EXISTS "bounties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_id" text DEFAULT encode(gen_random_bytes(8), 'hex') NOT NULL,
	-- Provenance: bounty hangs off a hack_trace where possible so the on-chain
	-- evidence is already in the system. Nullable for v2 (free-standing
	-- loss_report-driven bounties).
	"hack_trace_id" uuid,
	"victim_email" text NOT NULL,
	"victim_submitter_id" uuid,
	"kind" bounty_kind NOT NULL,
	-- recovery: basis points (e.g., 1000 = 10% of recovered funds). NULL for flat kinds.
	"recovery_percent_bps" integer,
	-- info_recovery / info_arrest: flat USDC amount. NULL for recovery kind.
	"flat_amount_usdc" numeric(18, 2),
	-- Amount actually held in the custodial Circle escrow wallet. Bumped by
	-- the funding webhook; the bounty stays in `draft` until this is > 0.
	"escrowed_amount_usdc" numeric(18, 2) NOT NULL DEFAULT 0,
	"circle_wallet_id" text,
	"funding_tx_hash" text,
	"status" bounty_status NOT NULL DEFAULT 'draft',
	-- Legal posture for info_arrest: victim attests they've filed a report.
	-- We store the case ref + jurisdiction; we never claim to verify it
	-- ourselves. info_arrest bounties MUST have police_report_filed=true (CHECK below).
	"police_report_filed" boolean NOT NULL DEFAULT false,
	"police_report_ref" text,
	"terms_accepted_at" timestamp,
	-- After this timestamp, no new claims accepted; cron sweeps to 'expired'
	-- and triggers a refund payout row.
	"expires_at" timestamp NOT NULL,
	-- What info is wanted, what counts as success. Markdown allowed; rendered
	-- on the public bounty page (full text gated to trusted+ for skin-in-game).
	"description" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	-- Shape integrity: recovery kind must specify a percent; flat kinds must
	-- specify a flat amount; info_arrest must carry a police-report attestation.
	CONSTRAINT "bounties_recovery_has_percent" CHECK (
		(kind <> 'recovery') OR (recovery_percent_bps IS NOT NULL AND recovery_percent_bps > 0 AND recovery_percent_bps <= 10000)
	),
	CONSTRAINT "bounties_flat_has_amount" CHECK (
		(kind NOT IN ('info_recovery', 'info_arrest')) OR (flat_amount_usdc IS NOT NULL AND flat_amount_usdc > 0)
	),
	CONSTRAINT "bounties_arrest_needs_report" CHECK (
		(kind <> 'info_arrest') OR (police_report_filed = true)
	)
);
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "bounties" ADD CONSTRAINT "bounties_hack_trace_id_fk" FOREIGN KEY ("hack_trace_id") REFERENCES "public"."hack_traces"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bounties" ADD CONSTRAINT "bounties_victim_submitter_id_fk" FOREIGN KEY ("victim_submitter_id") REFERENCES "public"."submitters"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "bounties_public_id_idx" ON "bounties" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bounties_status_idx" ON "bounties" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bounties_hack_trace_idx" ON "bounties" USING btree ("hack_trace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bounties_victim_submitter_idx" ON "bounties" USING btree ("victim_submitter_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bounties_expires_at_idx" ON "bounties" USING btree ("expires_at");--> statement-breakpoint

-- =====================================================================
-- BOUNTY CLAIMS
-- =====================================================================

CREATE TABLE IF NOT EXISTS "bounty_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_id" text DEFAULT encode(gen_random_bytes(8), 'hex') NOT NULL,
	"bounty_id" uuid NOT NULL,
	"claimant_submitter_id" uuid NOT NULL,
	-- Snapshot the claimant's tier at submit time. Used to defend the
	-- audit log against later tier changes (we want to know they were
	-- 'trusted' when they got to submit, regardless of where they end up).
	"claimant_tier_at_submit" clearance_tier NOT NULL,
	-- Sealed evidence package — only curator + victim should read.
	-- JSON: { targetAddresses: string[], suspectedEntity?: string,
	--         narrative: string, citedSubmissionIds?: string[],
	--         attachmentUrls?: string[], chain?: string }
	"evidence_payload" jsonb NOT NULL,
	-- Refundable claim bond. Slashed to the victim's pool on a bad_faith
	-- or doxx_attempt verdict; refunded otherwise. Zero allowed for v1 if
	-- bond is disabled by env flag.
	"bond_amount_usdc" numeric(18, 2) NOT NULL DEFAULT 0,
	"bond_tx_hash" text,
	"bond_refunded_tx_hash" text,
	"status" bounty_claim_status NOT NULL DEFAULT 'submitted',
	"rejection_reason" bounty_claim_rejection_reason,
	-- True when the verdict is bad_faith or doxx_attempt. Denormalized so
	-- the strike-count update on submitters is a single increment.
	"strike_issued" boolean NOT NULL DEFAULT false,
	"curator_notes" text,
	-- Victim confirms outcome (funds returned / arrest documented). Optional —
	-- curator can accept without victim ack for clear-cut on-chain recoveries.
	"victim_acked_at" timestamp,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp,
	"submitted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "bounty_claims" ADD CONSTRAINT "bounty_claims_bounty_id_fk" FOREIGN KEY ("bounty_id") REFERENCES "public"."bounties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bounty_claims" ADD CONSTRAINT "bounty_claims_claimant_submitter_id_fk" FOREIGN KEY ("claimant_submitter_id") REFERENCES "public"."submitters"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bounty_claims" ADD CONSTRAINT "bounty_claims_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "bounty_claims_public_id_idx" ON "bounty_claims" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bounty_claims_bounty_idx" ON "bounty_claims" USING btree ("bounty_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bounty_claims_claimant_idx" ON "bounty_claims" USING btree ("claimant_submitter_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bounty_claims_status_idx" ON "bounty_claims" USING btree ("status");--> statement-breakpoint
-- One claim per (bounty, claimant) — keeps the strike economics honest;
-- if a claimant wants to add evidence they revise the existing claim.
CREATE UNIQUE INDEX IF NOT EXISTS "bounty_claims_bounty_claimant_idx" ON "bounty_claims" USING btree ("bounty_id", "claimant_submitter_id");--> statement-breakpoint

-- =====================================================================
-- BOUNTY PAYOUTS — ledger; separate so partial payouts and multi-claimant
-- bounties have a clean audit trail and a single source of truth.
-- =====================================================================

CREATE TABLE IF NOT EXISTS "bounty_payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bounty_id" uuid NOT NULL,
	-- Nullable: refund-to-victim payouts have no associated claim.
	"bounty_claim_id" uuid,
	"amount_usdc" numeric(18, 2) NOT NULL,
	"payout_tx_hash" text,
	"circle_transfer_id" text,
	-- 'claimant' = winning claim payout, 'victim_refund' = expiry/cancel
	-- refund, 'platform_fee' = future take-rate slot (zero today per
	-- no_fees_yet directive), 'bond_refund' = claim bond returned to a
	-- claimant after a no-strike rejection, 'bond_slash' = bond redirected
	-- to victim after a bad_faith verdict.
	"payee_kind" text NOT NULL,
	"payee_submitter_id" uuid,
	"status" text NOT NULL DEFAULT 'pending',  -- pending | sent | failed
	"failure_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"sent_at" timestamp
);
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "bounty_payouts" ADD CONSTRAINT "bounty_payouts_bounty_id_fk" FOREIGN KEY ("bounty_id") REFERENCES "public"."bounties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bounty_payouts" ADD CONSTRAINT "bounty_payouts_bounty_claim_id_fk" FOREIGN KEY ("bounty_claim_id") REFERENCES "public"."bounty_claims"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bounty_payouts" ADD CONSTRAINT "bounty_payouts_payee_submitter_id_fk" FOREIGN KEY ("payee_submitter_id") REFERENCES "public"."submitters"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "bounty_payouts_bounty_idx" ON "bounty_payouts" USING btree ("bounty_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bounty_payouts_claim_idx" ON "bounty_payouts" USING btree ("bounty_claim_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bounty_payouts_status_idx" ON "bounty_payouts" USING btree ("status");
