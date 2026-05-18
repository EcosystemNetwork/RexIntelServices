-- =====================================================================
-- Drop all remaining Circle residue from the schema.
--
-- Circle was ripped 2026-05-18 — the auth rail moved to Magic Link, the
-- bounty escrow rail was deleted entirely (replacement TBD, kill-switched
-- behind BOUNTY_CUSTODY_RAIL_ENABLED). The four columns + one table this
-- migration drops have had zero producers in src/ since the rip; this
-- removes them from the live Neon schema so future `drizzle-kit generate`
-- runs don't keep regenerating them.
--
-- IF EXISTS guards on every operation so the migration is safe to run
-- against any prior schema state (the journal/snapshot drift flagged in
-- the 2026-05-18 audit means we can't fully trust drizzle-kit to know
-- what's actually on Neon).
-- =====================================================================

-- submitters.circle_user_id (Circle programmable-wallet UUID) + its
-- partial-unique index. Never read since the Magic swap; magic_issuer
-- is the live identity column.
DROP INDEX IF EXISTS "submitters_circle_user_idx";
ALTER TABLE "submitters" DROP COLUMN IF EXISTS "circle_user_id";

-- bounties: per-bounty Circle Developer-Controlled wallet. The
-- provisioning script and inbound webhook are both gone; these columns
-- have been NULL for every bounty created after 2026-05-18.
DROP INDEX IF EXISTS "bounties_circle_wallet_addr_idx";
ALTER TABLE "bounties" DROP COLUMN IF EXISTS "circle_wallet_id";
ALTER TABLE "bounties" DROP COLUMN IF EXISTS "circle_wallet_address";

-- bounty_payouts: Circle transfer id for the outbound USDC send. The
-- payout cron was deleted with the rest of Circle; no producer remains.
ALTER TABLE "bounty_payouts" DROP COLUMN IF EXISTS "circle_transfer_id";

-- circle_webhook_deliveries: inbound dedupe ledger for the Circle
-- webhook. The webhook route itself was deleted with the rest of
-- Circle; the table has no producer.
DROP TABLE IF EXISTS "circle_webhook_deliveries";
