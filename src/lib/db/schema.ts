import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  numeric,
  pgEnum,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import type { PersonaSlug } from "../personas";

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
  "capital",
  "residency",
  "perks",
  "fellowship",
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
  // What flavor of intel this is. `tip` is the default — a community
  // sighting or short brief. `original` is in-house signal that satisfies
  // the editorial bar of the weekly digest (≥1 original per issue).
  // `incident` is an evergreen postmortem (e.g. "[Protocol] hack timeline")
  // — long-form, address-anchored, the SEO surface targeting `[protocol]
  // hack timeline` queries.
  kind?: "tip" | "original" | "incident";
  // Editorial provenance grade. `primary` = first-hand evidence (on-chain
  // proof, screenshot from the affected party, direct quote). `secondary` =
  // reputable reporting that cites primary sources. `hearsay` = rumor or
  // unverified DM. Surfaced as a chip on intel cards/detail so readers can
  // judge weight at a glance; gates which rows the digest is allowed to
  // promote to the editorial-bar slot.
  sourceGrade?: "primary" | "secondary" | "hearsay";
  // Snapshot of the primary source frozen against link-rot. Typically an
  // archive.org or archive.today URL paired with the live `sources` link.
  // Renders as a "snapshot" link next to the source and as `isBasedOn` in
  // the article JSON-LD.
  archiveUrl?: string;
  // Persona segments this intel speaks to. Drives the per-persona weekly
  // digest routing (see /api/cron/draft-digest). Empty/undefined = goes to
  // all personas, same grace rule as ungraded sourceGrade.
  personas?: PersonaSlug[];
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
  // Hackathon prize pool in USD (numeric so the listing can filter by amount).
  // Free-form descriptions like "ETH from sponsors" go in `description`.
  prizeUsd?: number;
  // ISO timestamp. Hackathons in particular have a registration cutoff that
  // closes before kickoff; surfaced as a "Register by …" chip on cards and
  // the detail page. For events without a separate registration step, leave
  // this unset (the start date already implies the cutoff).
  registrationDeadline?: string;
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
  // Set true for pop-ups that take applications continuously (rare — most
  // are cohort-gated with a hard cutoff). UI prefers `applicationDeadline`
  // when both are set.
  rolling?: boolean;
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

// VC funds and angels that publicly accept cold pitches. Distinct from
// accelerators — no cohort, no fixed program, equity check on a rolling
// basis. Surfaced on /intel?lane=capital so founders can shortlist
// first-check leads without trawling individual fund sites.
export type CapitalPayload = {
  name: string; // fund / firm name (often same as organization)
  organization: string;
  organizationUrl?: string;
  description: string;
  stage?: string; // "Pre-seed", "Seed → Series A"
  checkSize?: string; // "$250k–$2M", "Up to $500k"
  location?: string; // HQ — "San Francisco", "Columbia, MO", "Remote-friendly"
  focus?: string; // "Generalist", "AI / agents", "DeFi infra"
  pitchUrl?: string; // public pitch portal — what makes the entry actionable
  // Free-form turnaround promise the fund advertises. Surfaced as a chip
  // because it's the most differentiating signal for founders comparing leads.
  decisionWindow?: string; // "Decision in <3 weeks", "30-day cycle"
  tags?: string[];
  imageUrl?: string;
};

// Multi-week founder / builder residency programs. Distinct from
// accelerators (no equity check, typically), from pop-up cities (smaller
// + tightly-curated cohort, themed), and from grants (no money — selection
// + housing + community is the value). Examples: The Bridge, Stripe Atlas
// retreats, Mercury cohort weeks.
export type ResidencyPayload = {
  name: string;
  organization: string;
  organizationUrl?: string;
  description: string;
  // Dates are required so the listing can bucket past vs upcoming. ISO.
  startsAt: string;
  endsAt: string;
  city?: string;
  country?: string;
  venue?: string;
  url?: string;
  applyUrl?: string;
  applicationDeadline?: string;
  // Set true for residencies that review rolling applications (Antler,
  // Pioneer, HF0, SPC). UI prefers `applicationDeadline` when both are set.
  rolling?: boolean;
  cohortSize?: string; // "20 founders", "Up to 50"
  cost?: string; // "Free + travel covered", "$5k tuition"
  focus?: string;
  tags?: string[];
  imageUrl?: string;
};

// Fellowship programs — stipend-funded research / building cohorts. Distinct
// from accelerators (no equity, typically no founder cohort + venture lane),
// from grants (multi-month structured program + mentorship, not just money),
// and from residencies (open to non-founders: PhDs, researchers, early-career
// engineers). Examples: Thiel Fellowship, Anthropic Fellows, EPF, Schmidt
// Sciences AI2050, MEV Research Fellowship.
export type FellowshipPayload = {
  name: string;
  organization: string;
  organizationUrl?: string;
  description: string;
  // Free-form stipend / award. "$200k over 2 years", "$24k stipend", "$100k
  // + SF residency". Headline chip on the card.
  stipend?: string;
  // "6 months", "1 year", "9 months". Surfaced next to stipend.
  duration?: string;
  // Free-form eligibility: "PhD students", "Under 23", "Open to anyone",
  // "Strong open-source Ethereum contribution history". Differentiates
  // gated programs from open ones.
  eligibility?: string;
  // "SF", "Remote", "Worldwide", "Berlin / Remote".
  location?: string;
  focus?: string;
  applyUrl?: string;
  // ISO timestamp for next cohort application deadline.
  nextDeadline?: string;
  rolling?: boolean;
  // "Annual", "Twice yearly", "Continuous" — cohort cadence so applicants
  // can plan ahead even when a window is closed.
  cadence?: string;
  tags?: string[];
  imageUrl?: string;
};

// Vendor + service perks programs: infra credits (RPCs, compute, indexers),
// AWS Activate-style cloud credits, legal/accounting templates, and similar.
// Distinct from grants (non-dilutive cash) and capital (equity) — the value
// is in-kind: credits, free tier extensions, services. Same intake shape
// across providers so the lane stays scannable.
export type PerksPayload = {
  name: string;
  organization: string; // Alchemy, QuickNode, AWS, Stripe, etc.
  organizationUrl?: string;
  description: string;
  // Free-form: "Up to $25k in credits", "$5k AWS credits + support",
  // "Free Pro tier for 12 months". Surfaced as the headline chip.
  value?: string;
  // What the perk is — "Infra · RPC", "Compute · GPU", "Legal · Templates",
  // "Cloud · Credits". Drives the category filter chips on the lane.
  category?: string;
  // Ecosystem narrowing — "Solana", "Ethereum", "Bitcoin", "Multi-chain",
  // "Any". Lets a Solana builder filter to just Solana-relevant perks.
  ecosystem?: string;
  // Free-form eligibility blurb: "Solana builders, any stage",
  // "Pre-revenue startups <2 years old", "AWS Activate-eligible teams".
  eligibility?: string;
  applyUrl?: string;
  // ISO timestamp. Most perks are rolling — use rolling=true in that case.
  deadline?: string;
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
  | AcceleratorPayload
  | CapitalPayload
  | ResidencyPayload
  | PerksPayload
  | FellowshipPayload;

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
    // Long, unguessable token that lets a non-anonymous submitter return and
    // edit their own submission via /submit/edit/[token]. 16 bytes = 128 bits
    // of entropy — plenty for a "secret URL" workflow. Generated on insert;
    // never rotates. Surfaced via email when submitterEmail is provided.
    editToken: text("edit_token")
      .notNull()
      .default(sql`encode(gen_random_bytes(16), 'hex')`),
    // Optional expiry on the edit token. NULL = never expires (preserves the
    // pre-0017 behavior for tokens already in the wild). New submissions are
    // created with this set by /api/submit so a leaked archived email can't
    // be used to edit a submission years later.
    editTokenExpiresAt: timestamp("edit_token_expires_at"),
    // Linked submitter identity. NULL for anonymous submissions; populated
    // for any submission whose submitterEmail matches a row in submitters.
    submitterId: uuid("submitter_id").references(() => submitters.id, {
      onDelete: "set null",
    }),
    // Denormalized from payload.startsAt for event submissions so we can sort
    // by date in SQL with an index instead of pulling everything and sorting
    // in app code. NULL for intel submissions.
    eventStartsAt: timestamp("event_starts_at"),
    // Denormalized from payload.endsAt. Lets the public lanes treat a
    // multi-week hackathon as "ongoing" instead of bucketing it Past the day
    // after kickoff. NULL when the payload has no endsAt or for intel rows.
    eventEndsAt: timestamp("event_ends_at"),
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
    editTokenIdx: uniqueIndex("submissions_edit_token_idx").on(t.editToken),
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
    // Drives the /contributors/[slug] profile query (every submission tied
    // to a contributor) and the accuracy-score aggregate.
    submitterIdIdx: index("submissions_submitter_id_idx").on(t.submitterId),
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

// =====================================================================
// SUBMITTERS — first-class contributor identity. One row per unique
// submitter_email (case-insensitive). Lets us render /contributors/[slug]
// profile pages with bylines + accuracy score (featured / approved) and
// gives a stable identity that future features (badges, monthly leaderboard
// of contributors, etc.) can hang off. Anonymous submissions leave
// submissions.submitter_id NULL.
// =====================================================================

export const submitters = pgTable(
  "submitters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    displayHandle: text("display_handle").notNull(),
    // URL slug for /contributors/[slug]. Includes a uuid-prefix suffix so
    // collisions never happen and we never need a retry loop.
    slug: text("slug").notNull(),
    bio: text("bio"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    emailIdx: uniqueIndex("submitters_email_idx").on(sql`lower(${t.email})`),
    slugIdx: uniqueIndex("submitters_slug_idx").on(t.slug),
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
// INTEL VOTING + MONTHLY PRIZE POOL
//
// Community votes on approved intel. Winning intel at month end pays
// out from a community-funded pool wallet (USDC on Base by default —
// see lib/prize-pool.ts). Voting is magic-link confirmed: a vote_tokens
// row is created on email submit, and the click consumes it into an
// intel_votes row. PK on (submission_id, subscriber_id) keeps it 1:1.
// =====================================================================

export const intelVotes = pgTable(
  "intel_votes",
  {
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    subscriberId: uuid("subscriber_id")
      .notNull()
      .references(() => subscribers.id, { onDelete: "cascade" }),
    votedAt: timestamp("voted_at").defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.submissionId, t.subscriberId] }),
    subscriberIdx: index("intel_votes_subscriber_idx").on(t.subscriberId),
    votedAtIdx: index("intel_votes_voted_at_idx").on(t.votedAt),
  }),
);

export const voteTokens = pgTable(
  "vote_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // sha256(random_token) — the random token only ever exists in the email
    // link. A DB compromise yields hashes, not live voting power.
    tokenHash: text("token_hash").notNull(),
    email: text("email").notNull(),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at").notNull(),
    usedAt: timestamp("used_at"),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    tokenHashIdx: uniqueIndex("vote_tokens_token_hash_idx").on(t.tokenHash),
    emailSubmissionIdx: index("vote_tokens_email_submission_idx").on(
      t.email,
      t.submissionId,
    ),
    expiresAtIdx: index("vote_tokens_expires_at_idx").on(t.expiresAt),
  }),
);

// One row per settled month. yearMonth is UTC "YYYY-MM" — the canonical
// bucket the leaderboard slices by. payouts is jsonb of:
//   [{ place: 1, submissionId, amount, txHash, paidTo }]
// so place-by-place doesn't require schema changes if we change the split.
// MonthlyPrizePayout.amount is a numeric string (e.g. "1234.560000") — same
// shape numeric(38,6) round-trips through the pg driver, so payouts written
// from app code can use the same decimal-string representation as the
// poolBalanceAtSettle column without any conversion.
export type MonthlyPrizePayout = {
  place: number;
  submissionId: string;
  amount: string;
  txHash?: string;
  // EVM addresses are stored lowercased so two payouts to the same wallet
  // dedupe and joins to the addresses table hit. Caller is responsible for
  // .toLowerCase() before insert (helper in lib/prize-pool.ts).
  paidTo?: string;
  notes?: string;
};

export const monthlyPrizes = pgTable(
  "monthly_prizes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // UTC "YYYY-MM" — DB-level CHECK in migration 0016 enforces the format
    // so a typo can't silently corrupt the leaderboard sort.
    yearMonth: text("year_month").notNull(),
    // numeric(38,6) — exact decimal, no float drift. 38 digits + 6 scale
    // covers any plausible pool size at USDC's 6-decimal precision.
    poolBalanceAtSettle: numeric("pool_balance_at_settle", {
      precision: 38,
      scale: 6,
    }).notNull(),
    poolCurrency: text("pool_currency").notNull().default("USDC"),
    poolChain: text("pool_chain").notNull().default("base"),
    payouts: jsonb("payouts").$type<MonthlyPrizePayout[]>().notNull().default([]),
    settledAt: timestamp("settled_at"),
    // ON DELETE SET NULL so offboarding an admin doesn't block deletion of
    // the user row; the audit trail keeps the prize record with a null
    // settler rather than a dangling FK.
    settledBy: uuid("settled_by").references(() => users.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    yearMonthIdx: uniqueIndex("monthly_prizes_year_month_idx").on(t.yearMonth),
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
  votes: many(intelVotes),
}));

export const intelVotesRelations = relations(intelVotes, ({ one }) => ({
  submission: one(submissions, {
    fields: [intelVotes.submissionId],
    references: [submissions.id],
  }),
  subscriber: one(subscribers, {
    fields: [intelVotes.subscriberId],
    references: [subscribers.id],
  }),
}));

export const voteTokensRelations = relations(voteTokens, ({ one }) => ({
  submission: one(submissions, {
    fields: [voteTokens.submissionId],
    references: [submissions.id],
  }),
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
export type IntelVote = typeof intelVotes.$inferSelect;
export type VoteToken = typeof voteTokens.$inferSelect;
export type MonthlyPrize = typeof monthlyPrizes.$inferSelect;

// Persona tag slugs / labels live in /src/lib/personas.ts so client
// components (e.g. the landing-page signup form) can import them without
// pulling pg-core into the client bundle.
export { PERSONA_SLUGS, PERSONA_LABELS } from "../personas";
export type { PersonaSlug } from "../personas";
