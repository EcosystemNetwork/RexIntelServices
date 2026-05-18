-- 0031_bounty_per_wallet
--
-- Per-bounty Circle Developer-Controlled wallet. Adds the deposit-address
-- column + index that the inbound Circle webhook uses for reverse lookup
-- (deposit address → bounty). The wallet ID column already existed from
-- migration 0029.
--
-- Why per-bounty (vs. shared escrow): with a shared wallet the inbound
-- webhook can't attribute an arriving USDC transfer to a specific bounty
-- — Circle has no sender-supplied refId for incoming transfers. A wallet
-- per bounty makes attribution trivial: webhook lands, lookup by
-- destination address, call /fund. Circle DCW allows unlimited wallets at
-- no per-wallet cost so the only overhead is one API hop at create time.

ALTER TABLE "bounties" ADD COLUMN IF NOT EXISTS "circle_wallet_address" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bounties_circle_wallet_addr_idx" ON "bounties" USING btree (lower("circle_wallet_address"));
