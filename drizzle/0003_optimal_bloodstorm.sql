ALTER TABLE "submissions" ADD COLUMN "featured_in_campaign_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "submissions" ADD CONSTRAINT "submissions_featured_in_campaign_id_campaigns_id_fk" FOREIGN KEY ("featured_in_campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "submissions_featured_campaign_idx" ON "submissions" USING btree ("featured_in_campaign_id");