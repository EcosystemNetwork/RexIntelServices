-- 0028_hack_traces
--
-- Victim-reported hack traces: user submits a drained wallet, we BFS-trace
-- the outbound flow via Etherscan (ETH + ERC-20 transfers), terminate at
-- known-attributed addresses (exchange/mixer) or after `max_hops`, and
-- write the result into the attribution graph as `victim-trace` source.
--
-- Three pieces:
--   1. New attribution source `victim-trace` — distinct from manual
--      `community-loss-report` (those carry a victim's *story*; these carry
--      *on-chain evidence*). Same trust class (community-derived) so the
--      industry-only toggle filters both out.
--   2. New table `hack_traces` — one row per trace request. Carries status,
--      submitter contact, summary stats, and the public_id for sharing.
--   3. New table `hack_trace_hops` — each edge in the BFS, with the on-chain
--      transaction that produced it. References `addresses` so terminal-node
--      labeling lights up automatically as the attribution graph grows.

ALTER TYPE "address_attribution_source" ADD VALUE IF NOT EXISTS 'victim-trace';--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "hack_traces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_id" text DEFAULT encode(gen_random_bytes(8), 'hex') NOT NULL,
	"chain" text NOT NULL,
	"root_address" text NOT NULL,
	"victim_label" text,
	"loss_usd" numeric(18, 2),
	"loss_token_symbol" text,
	-- Email + IP captured for rate limiting and follow-up. Email is the only
	-- channel we have if a trace turns up something a curator wants to chase.
	"submitter_email" text,
	"submitter_ip" text,
	-- pending → running → complete | failed. Pending rows are picked up by
	-- the trace runner; running rows have a started_at; complete/failed are
	-- terminal.
	"status" text NOT NULL DEFAULT 'pending',
	"failure_reason" text,
	"max_hops" integer NOT NULL DEFAULT 3,
	"hops_explored" integer NOT NULL DEFAULT 0,
	"terminal_count" integer NOT NULL DEFAULT 0,
	"total_outflow_native" numeric(38, 0),
	"total_outflow_token_symbol" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "hack_trace_hops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trace_id" uuid NOT NULL,
	-- 1 = direct outflow from root. 2 = one hop further. Capped at trace.max_hops.
	"depth" integer NOT NULL,
	"from_address_id" uuid NOT NULL,
	"to_address_id" uuid NOT NULL,
	"tx_hash" text NOT NULL,
	"block_number" bigint,
	-- Native amount in smallest unit (wei for ETH, base units for ERC-20).
	-- Stored as numeric(78,0) so a wei value up to 10^77 fits without loss.
	"amount_raw" numeric(78, 0),
	-- Token tag — null = native (ETH/MATIC/etc.); else the ERC-20 symbol.
	"token_symbol" text,
	"token_address" text,
	"token_decimals" integer,
	-- USD valuation at the time of the tx. Often null in v1 (we don't have a
	-- historical price oracle yet); populated for terminal-node "where is it
	-- today" snapshots which use the current spot price.
	"amount_usd" numeric(18, 2),
	"tx_timestamp" timestamp,
	-- Null = transit hop. Else: 'attribution_match' (hit a known exchange/
	-- mixer/etc. in our graph), 'dust' (sub-threshold), 'depth' (max_hops
	-- hit), 'still_moving' (frontier ran out of budget but funds remained
	-- moving). Powers the terminal-node labels on the results page.
	"terminal_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "hack_trace_hops" ADD CONSTRAINT "hack_trace_hops_trace_id_hack_traces_id_fk" FOREIGN KEY ("trace_id") REFERENCES "public"."hack_traces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "hack_trace_hops" ADD CONSTRAINT "hack_trace_hops_from_address_id_addresses_id_fk" FOREIGN KEY ("from_address_id") REFERENCES "public"."addresses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "hack_trace_hops" ADD CONSTRAINT "hack_trace_hops_to_address_id_addresses_id_fk" FOREIGN KEY ("to_address_id") REFERENCES "public"."addresses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "hack_traces_public_id_idx" ON "hack_traces" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hack_traces_status_idx" ON "hack_traces" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hack_traces_chain_root_idx" ON "hack_traces" USING btree ("chain","root_address");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hack_trace_hops_trace_idx" ON "hack_trace_hops" USING btree ("trace_id","depth");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hack_trace_hops_from_idx" ON "hack_trace_hops" USING btree ("from_address_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hack_trace_hops_to_idx" ON "hack_trace_hops" USING btree ("to_address_id");--> statement-breakpoint
-- Dedupe: a given trace shouldn't record the same (tx_hash, depth) twice
-- if the runner re-enters the same address.
CREATE UNIQUE INDEX IF NOT EXISTS "hack_trace_hops_dedupe_idx" ON "hack_trace_hops" USING btree ("trace_id","tx_hash","from_address_id","to_address_id");
