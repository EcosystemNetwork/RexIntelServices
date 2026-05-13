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

export const submissionTypeEnum = pgEnum("submission_type", [
  "intel",
  "event",
  "job",
  "grant",
  "accelerator",
  "popup_city",
  "hackathon",
]);

export const submissionStatusEnum = pgEnum("submission_status", [
  "pending",
  "approved",
  "rejected",
  "spam",
]);

// `persona` — buyer/role segments (compliance, exchange-risk, investigator,
// gov-le, fund-risk). Used to send segment-targeted briefings.
// `interest` — topical tags (ethereum, conferences, etc.). Default for
// admin-created tags so existing tooling keeps working unchanged.
export const tagKindEnum = pgEnum("tag_kind", ["persona", "interest"]);

// Role of an address within a piece of intel. `subject` = the address the
// intel is *about* (the attacker, the scammer, the sanctioned entity).
// `counterparty` = a related address (recipient of stolen funds, mixer hop).
// `observed` = an address mentioned but not yet attributed.
export const addressRoleEnum = pgEnum("address_role", [
  "subject",
  "counterparty",
  "observed",
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
  // Distinguishes buyer-persona segments from topical interest tags so the
  // signup flow can offer the persona set without exposing every interest
  // tag the team uses internally.
  kind: tagKindEnum("kind").notNull().default("interest"),
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
  // Path under /public (e.g. "/Rex-Intel-ETHConf-Social-Card.png") or absolute
  // URL. Rendered as a banner on the event detail page and the OG image.
  imageUrl?: string;
};

export type JobPayload = {
  title: string;
  company: string;
  companyUrl?: string;
  description: string;
  location?: string; // free-form: "San Francisco, CA" / "Remote (US)" / "EU"
  remote?: boolean;
  employmentType?: "full-time" | "part-time" | "contract" | "internship";
  seniority?: "junior" | "mid" | "senior" | "staff" | "principal" | "exec";
  compensation?: string;
  applyUrl?: string;
  tags?: string[];
  expiresAt?: string;
  imageUrl?: string;
};

export type HackathonPayload = {
  name: string;
  organization?: string; // ETHGlobal, EthCC, Devpost, etc.
  organizationUrl?: string;
  description: string;
  // Required dates — both used for past/upcoming filtering on listing pages.
  startsAt: string;
  endsAt: string;
  mode?: "online" | "irl" | "hybrid";
  city?: string;
  country?: string;
  venue?: string;
  url?: string;
  registrationUrl?: string;
  registrationDeadline?: string;
  prizePool?: string; // "$300K+ in prizes", "ETH from sponsors"
  tracks?: string[]; // DeFi, AI, gaming, etc.
  sponsors?: string[];
  tags?: string[];
  imageUrl?: string;
};

export type PopupCityPayload = {
  name: string;
  organization?: string; // host org if separate from the city name
  organizationUrl?: string;
  description: string;
  // Multi-week run — both required to make the cards/sort meaningful.
  startsAt: string; // ISO timestamp
  endsAt: string;   // ISO timestamp
  city?: string;
  country?: string;
  venue?: string;
  url?: string;
  applyUrl?: string;
  // Optional application deadline distinct from event start (most apps close
  // weeks before the residency begins).
  applicationDeadline?: string;
  focus?: string; // "Longevity + AI", "DeFi research", etc.
  tags?: string[];
  imageUrl?: string;
};

export type GrantPayload = {
  name: string;
  organization: string;
  organizationUrl?: string;
  description: string;
  amount?: string; // free-form: "Up to $250k", "$50k–$500k"
  focus?: string; // "Public goods", "Infrastructure", "ZK research"
  applyUrl?: string;
  // ISO timestamp. Either deadline OR rolling — UI prefers deadline when both.
  deadline?: string;
  rolling?: boolean;
  tags?: string[];
  imageUrl?: string;
};

export type AcceleratorPayload = {
  name: string;
  organization: string;
  organizationUrl?: string;
  description: string;
  duration?: string; // "3 months", "6 weeks", "12 weeks + ongoing"
  investment?: string; // "$500k for 7%", "Up to $250k SAFE"
  location?: string; // "San Francisco", "Remote", "NYC + Remote"
  focus?: string; // "Early-stage crypto", "DeFi", "Infra"
  applyUrl?: string;
  // ISO timestamp for next cohort application deadline. Optional.
  nextDeadline?: string;
  rolling?: boolean;
  tags?: string[];
  imageUrl?: string;
};

export type SubmissionPayload =
  | IntelPayload
  | EventPayload
  | JobPayload
  | PopupCityPayload
  | HackathonPayload
  | GrantPayload
  | AcceleratorPayload;

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
    // Pin a row to the top of public listings (e.g. flagship conference at the
    // top of /events). Sorted as `featured DESC, eventStartsAt ASC` so multiple
    // featured rows fall back to chronological order among themselves.
    featured: boolean("featured").notNull().default(false),
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
// ADDRESSES — first-class wallet/account identifiers extracted from intel
// submissions. Building this graph from day one is the long-term moat:
// every approved submission compounds a proprietary dataset of who's who
// on-chain that the future investigations product can query.
// =====================================================================

export const addresses = pgTable(
  "addresses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Lowercased chain identifier — "ethereum", "bitcoin", "solana", "tron",
    // "bsc", etc. Free text rather than enum because new chains appear faster
    // than we want to ship migrations.
    chain: text("chain").notNull(),
    // Stored verbatim as the user submitted (preserves Bitcoin checksum
    // casing). Lookups are case-insensitive via the lower(...) unique index.
    address: text("address").notNull(),
    // Human label if known: "Lazarus cluster", "Tornado Cash router", etc.
    label: text("label"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    // Unique on (chain, lower(address)) so 0xABC and 0xabc dedupe to one row
    // on EVM chains. Bitcoin/Solana mixed-case addresses also dedupe safely
    // because we always pass lowercased values to the lookup.
    chainAddrIdx: uniqueIndex("addresses_chain_addr_idx").on(
      t.chain,
      sql`lower(${t.address})`,
    ),
    chainIdx: index("addresses_chain_idx").on(t.chain),
  }),
);

export const intelAddresses = pgTable(
  "intel_addresses",
  {
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    addressId: uuid("address_id")
      .notNull()
      .references(() => addresses.id, { onDelete: "cascade" }),
    role: addressRoleEnum("role").notNull().default("observed"),
    addedAt: timestamp("added_at").defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.submissionId, t.addressId] }),
    // Reverse lookup: "show me every intel item that mentions this address"
    addressIdx: index("intel_addresses_address_idx").on(t.addressId),
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

export const submissionsRelations = relations(submissions, ({ one, many }) => ({
  reviewer: one(users, {
    fields: [submissions.reviewedBy],
    references: [users.id],
  }),
  addresses: many(intelAddresses),
}));

export const addressesRelations = relations(addresses, ({ many }) => ({
  submissions: many(intelAddresses),
}));

export const intelAddressesRelations = relations(intelAddresses, ({ one }) => ({
  submission: one(submissions, {
    fields: [intelAddresses.submissionId],
    references: [submissions.id],
  }),
  address: one(addresses, {
    fields: [intelAddresses.addressId],
    references: [addresses.id],
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
export type Address = typeof addresses.$inferSelect;
export type IntelAddress = typeof intelAddresses.$inferSelect;
export type AddressRole = (typeof addressRoleEnum.enumValues)[number];

// Persona tag slugs / labels live in /src/lib/personas.ts so client
// components (e.g. the landing-page signup form) can import them without
// pulling pg-core into the client bundle.
export { PERSONA_SLUGS, PERSONA_LABELS } from "../personas";
export type { PersonaSlug } from "../personas";
