import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  pgEnum,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// =====================================================================
// ENUMS
// =====================================================================

export const subscriberStatusEnum = pgEnum("subscriber_status", [
  "pending", // double opt-in not yet confirmed
  "active",
  "unsubscribed",
  "bounced", // hard bounce, do not send
  "complained", // marked as spam, do not send
]);

export const campaignStatusEnum = pgEnum("campaign_status", [
  "draft",
  "scheduled",
  "sending",
  "sent",
  "failed",
]);

export const sendStatusEnum = pgEnum("send_status", [
  "queued",
  "sent",
  "delivered",
  "opened",
  "clicked",
  "bounced",
  "complained",
  "failed",
]);

export const suppressionReasonEnum = pgEnum("suppression_reason", [
  "hard_bounce",
  "complaint",
  "manual",
  "unsubscribe_global",
]);

export const submissionTypeEnum = pgEnum("submission_type", ["intel", "event"]);

export const submissionStatusEnum = pgEnum("submission_status", [
  "pending",
  "approved",
  "rejected",
  "spam",
]);

// =====================================================================
// USERS (admin accounts)
// =====================================================================

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// =====================================================================
// SUBSCRIBERS
// =====================================================================

export const subscribers = pgTable(
  "subscribers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    status: subscriberStatusEnum("status").notNull().default("active"),
    // Token used in unsubscribe links and confirmation links
    unsubscribeToken: text("unsubscribe_token")
      .notNull()
      .default(sql`encode(gen_random_bytes(16), 'hex')`),
    // Free-form metadata: { source: "twitter_drop", company: "...", ... }
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    // Where they signed up: "import_2024_03", "landing_page", "api"
    source: text("source"),
    ipAddress: text("ip_address"),
    confirmedAt: timestamp("confirmed_at"),
    unsubscribedAt: timestamp("unsubscribed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    emailIdx: uniqueIndex("subscribers_email_idx").on(t.email),
    statusIdx: index("subscribers_status_idx").on(t.status),
    tokenIdx: uniqueIndex("subscribers_token_idx").on(t.unsubscribeToken),
  }),
);

// =====================================================================
// TAGS (for segmenting: "conferences", "hackathons", "ethereum", etc.)
// =====================================================================

export const tags = pgTable("tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const subscriberTags = pgTable(
  "subscriber_tags",
  {
    subscriberId: uuid("subscriber_id")
      .notNull()
      .references(() => subscribers.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at").defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.subscriberId, t.tagId] }),
    tagIdx: index("subscriber_tags_tag_idx").on(t.tagId),
  }),
);

// =====================================================================
// CAMPAIGNS
// =====================================================================

export const campaigns = pgTable("campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(), // internal name
  subject: text("subject").notNull(),
  fromName: text("from_name").notNull(),
  fromEmail: text("from_email").notNull(),
  replyTo: text("reply_to"),
  previewText: text("preview_text"),
  htmlBody: text("html_body").notNull(),
  textBody: text("text_body"), // plain text fallback - improves deliverability
  status: campaignStatusEnum("status").notNull().default("draft"),
  // If targetTagIds is empty, campaign goes to all active subscribers
  targetTagIds: jsonb("target_tag_ids").$type<string[]>().default([]),
  // Tally counters - updated as sends happen
  recipientCount: integer("recipient_count").default(0),
  sentCount: integer("sent_count").default(0),
  deliveredCount: integer("delivered_count").default(0),
  openedCount: integer("opened_count").default(0),
  clickedCount: integer("clicked_count").default(0),
  bouncedCount: integer("bounced_count").default(0),
  complainedCount: integer("complained_count").default(0),
  unsubscribedCount: integer("unsubscribed_count").default(0),
  scheduledFor: timestamp("scheduled_for"),
  sentAt: timestamp("sent_at"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// =====================================================================
// SENDS - one row per (campaign, subscriber). The audit log.
// =====================================================================

export const sends = pgTable(
  "sends",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    subscriberId: uuid("subscriber_id")
      .notNull()
      .references(() => subscribers.id, { onDelete: "cascade" }),
    status: sendStatusEnum("status").notNull().default("queued"),
    // Provider message id (Resend) - used to correlate webhook events
    providerMessageId: text("provider_message_id"),
    errorMessage: text("error_message"),
    sentAt: timestamp("sent_at"),
    deliveredAt: timestamp("delivered_at"),
    openedAt: timestamp("opened_at"),
    openCount: integer("open_count").default(0),
    clickedAt: timestamp("clicked_at"),
    clickCount: integer("click_count").default(0),
    bouncedAt: timestamp("bounced_at"),
    complainedAt: timestamp("complained_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    // Don't allow sending the same campaign to the same subscriber twice
    campaignSubscriberIdx: uniqueIndex("sends_campaign_subscriber_idx").on(
      t.campaignId,
      t.subscriberId,
    ),
    providerIdIdx: index("sends_provider_id_idx").on(t.providerMessageId),
    statusIdx: index("sends_status_idx").on(t.campaignId, t.status),
  }),
);

// =====================================================================
// CLICK URLS - we rewrite outbound links so we can track clicks
// =====================================================================

export const clickUrls = pgTable(
  "click_urls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    clickCount: integer("click_count").default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    campaignUrlIdx: uniqueIndex("click_urls_campaign_url_idx").on(
      t.campaignId,
      t.url,
    ),
  }),
);

// =====================================================================
// SUPPRESSION LIST - global block list. Once on here, never email again.
// Critical for sender reputation.
// =====================================================================

export const suppressions = pgTable(
  "suppressions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    reason: suppressionReasonEnum("reason").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    emailIdx: uniqueIndex("suppressions_email_idx").on(t.email),
  }),
);

// =====================================================================
// SUBMISSIONS - public-facing intake for both intel tips and event listings.
// One table, two payload shapes (discriminated by `type`). Approved rows are
// what the public /intel and /events pages read from.
// =====================================================================

export type IntelPayload = {
  headline: string;
  body: string;
  links?: string[];
  sources?: string[];
  category?: string;
  severity?: "low" | "medium" | "high" | "critical";
  anonymous?: boolean;
};

export type EventPayload = {
  name: string;
  startsAt: string; // ISO date string
  endsAt?: string;
  venue?: string;
  city?: string;
  country?: string;
  url?: string;
  description?: string;
  tags?: string[];
  priceTier?: "free" | "paid" | "invite";
  eventType?: "conference" | "workshop" | "meetup" | "hackathon" | "other";
};

export type SubmissionPayload = IntelPayload | EventPayload;

export const submissions = pgTable(
  "submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: submissionTypeEnum("type").notNull(),
    status: submissionStatusEnum("status").notNull().default("pending"),
    payload: jsonb("payload").$type<SubmissionPayload>().notNull(),
    // Optional — submitters can stay anonymous. Email is for credit + follow-up.
    submitterEmail: text("submitter_email"),
    submitterHandle: text("submitter_handle"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    honeypotTripped: boolean("honeypot_tripped").default(false).notNull(),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at"),
    reviewNotes: text("review_notes"),
    publishedAt: timestamp("published_at"),
    // Short, URL-safe id for public canonical URLs (/intel/abc123, /events/abc123)
    publicId: text("public_id")
      .notNull()
      .default(sql`encode(gen_random_bytes(8), 'hex')`),
    // Denormalized from payload.startsAt for event submissions so we can sort
    // by date in SQL with an index instead of pulling everything and sorting
    // in app code. NULL for intel submissions.
    eventStartsAt: timestamp("event_starts_at"),
    // Set by the digest cron when a submission is bundled into a draft
    // newsletter. Used to (a) avoid re-featuring the same item in the next
    // week's digest and (b) drive submitter-credit emails when the campaign
    // actually sends.
    featuredInCampaignId: uuid("featured_in_campaign_id").references(
      () => campaigns.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    statusIdx: index("submissions_status_idx").on(t.status),
    typeStatusIdx: index("submissions_type_status_idx").on(t.type, t.status),
    publicIdIdx: uniqueIndex("submissions_public_id_idx").on(t.publicId),
    publishedAtIdx: index("submissions_published_at_idx").on(t.publishedAt),
    // Covers the public /events query (filters by type+status, ranges +
    // sorts on eventStartsAt) and the digest cron's upcoming-events lookup.
    eventStartsAtIdx: index("submissions_event_starts_at_idx").on(
      t.type,
      t.status,
      t.eventStartsAt,
    ),
    // Fast lookup for "all submissions in campaign X" when sending credit emails.
    featuredCampaignIdx: index("submissions_featured_campaign_idx").on(
      t.featuredInCampaignId,
    ),
  }),
);

// =====================================================================
// RELATIONS
// =====================================================================

export const subscribersRelations = relations(subscribers, ({ many }) => ({
  tags: many(subscriberTags),
  sends: many(sends),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  subscribers: many(subscriberTags),
}));

export const subscriberTagsRelations = relations(subscriberTags, ({ one }) => ({
  subscriber: one(subscribers, {
    fields: [subscriberTags.subscriberId],
    references: [subscribers.id],
  }),
  tag: one(tags, {
    fields: [subscriberTags.tagId],
    references: [tags.id],
  }),
}));

export const campaignsRelations = relations(campaigns, ({ many, one }) => ({
  sends: many(sends),
  clickUrls: many(clickUrls),
  creator: one(users, {
    fields: [campaigns.createdBy],
    references: [users.id],
  }),
}));

export const sendsRelations = relations(sends, ({ one }) => ({
  campaign: one(campaigns, {
    fields: [sends.campaignId],
    references: [campaigns.id],
  }),
  subscriber: one(subscribers, {
    fields: [sends.subscriberId],
    references: [subscribers.id],
  }),
}));

export const submissionsRelations = relations(submissions, ({ one }) => ({
  reviewer: one(users, {
    fields: [submissions.reviewedBy],
    references: [users.id],
  }),
}));

// Type exports for use in app code
export type Subscriber = typeof subscribers.$inferSelect;
export type NewSubscriber = typeof subscribers.$inferInsert;
export type Campaign = typeof campaigns.$inferSelect;
export type NewCampaign = typeof campaigns.$inferInsert;
export type Send = typeof sends.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type Suppression = typeof suppressions.$inferSelect;
export type Submission = typeof submissions.$inferSelect;
export type NewSubmission = typeof submissions.$inferInsert;
