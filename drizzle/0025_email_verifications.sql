CREATE TABLE IF NOT EXISTS "email_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"verified_at" timestamp,
	"ip_address" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_verifications_email_expires_idx" ON "email_verifications" (lower("email"),"expires_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_verifications_created_at_idx" ON "email_verifications" ("created_at");
