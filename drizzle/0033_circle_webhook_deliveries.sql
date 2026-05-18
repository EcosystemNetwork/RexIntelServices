-- Inbound dedupe ledger for Circle webhook deliveries. The webhook handler
-- inserts notification_id with ON CONFLICT DO NOTHING; a duplicate insert
-- short-circuits the handler so retries can't double-credit a bounty's
-- escrowed_amount_usdc.
CREATE TABLE IF NOT EXISTS "circle_webhook_deliveries" (
  "notification_id" text PRIMARY KEY,
  "notification_type" text,
  "transaction_id" text,
  "received_at" timestamp DEFAULT now() NOT NULL
);
