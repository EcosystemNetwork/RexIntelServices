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
  type AnyPgColumn,
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
  // Firsthand victim reports of lost/stolen assets. Distinct from intel so
  // the editorial pipeline (digest cron, OG kicker, leaderboard prize pool)
  // isn't fed by self-reported losses. See LossReportPayload below.
  "loss_report",
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

// What an address IS — the entity-class tag that drives graph coloring,
// filter pills, and "show me all X" queries. This is the moat: most graph
// products require a paid Chainalysis/TRM seat to know that 0xbe0eb... is
// "Binance hot wallet 7" or that a given Tornado deposit was sanctioned.
// We attribute from authoritative public sources (OFAC, OFSI, EU, DefiLlama,
// curated lists) and let community contributions tighten the labels over time.
export const addressCategoryEnum = pgEnum("address_category", [
  "exchange", // CEX hot/cold wallets (Binance, Coinbase, Kraken)
  "defi-protocol", // protocol contracts (Aave, Compound, Uniswap routers)
  "treasury", // DAO treasuries
  "foundation", // ETH Foundation, Solana Foundation multisigs
  "bridge", // cross-chain bridges
  "mixer", // Tornado Cash, Wasabi coordinators, etc.
  "sanctioned", // OFAC / OFSI / EU listed
  "government-seized", // FBI / DOJ / IRS / Bundeskriminalamt seizure addresses
  "lost", // famously stuck/lost funds (Mt. Gox, Howells HDD)
  "dormant", // Satoshi-era untouched coins
  "hack-source", // attacker-controlled addresses in known incidents
  "hack-destination", // confirmed proceeds destinations
  "validator", // staking / validator addresses
  "personality", // publicly-known individuals (Vitalik, CZ, etc.)
  "market-maker", // Wintermute, Jump, GSR
  "mev-bot", // known MEV searchers
  "scam", // rug pulls, confirmed scam addresses
]);

// What KIND of entity owns the address. Pairs with category to answer
// "show me all government-owned addresses" or "all individual personalities".
export const addressOwnerKindEnum = pgEnum("address_owner_kind", [
  "exchange",
  "dao",
  "foundation",
  "government",
  "individual",
  "protocol",
  "market-maker",
  "criminal-group",
  "estate", // bankruptcy estates (Mt. Gox, FTX, Celsius)
  "unknown",
]);

// Where an attribution came from. Used by the harvesters to upsert
// idempotently and by the graph layer to display provenance. Precedence
// for denormalized `addresses.category` is enforced in
// `lib/address-attribution.ts`: sanctions sources > curated > derivative.
export const addressAttributionSourceEnum = pgEnum(
  "address_attribution_source",
  [
    "ofac", // US Treasury SDN list
    "ofsi", // UK Office of Financial Sanctions Implementation
    "eu-sanctions", // EU consolidated sanctions list
    "defillama", // DefiLlama protocol/treasury labels
    "rexintel-curated", // hand-curated by the RexIntel team
    "rexintel-community", // crowdsourced via /submit
    "etherscan", // Etherscan public label (manual capture)
    "incident", // derived from an approved intel submission
    // Firsthand victim report. Lowest precedence — never overrides a
    // sanctions/curated/incident attribution; hidden by default on /graph
    // behind the "Include user-reported" toggle.
    "community-loss-report",
    // Automated outbound trace from a victim-submitted root address. On-chain
    // evidence (tx hashes recorded in hack_trace_hops), so slightly higher
    // confidence than a self-reported story — but still community-class and
    // hidden behind the same toggle.
    "victim-trace",
    // Address surfaced in an accepted white-hat bounty claim. Carries an
    // adjudication audit trail (curator + victim ack) so it sits one step
    // above raw victim-trace in trust, but stays in the community class
    // and respects the industry-only toggle.
    "bounty-claim",
  ],
);

// Clearance tier gates which intel surfaces a contributor can read. Earned,
// not bought — see lib/clearance.ts for thresholds and lib/magic-auth.ts for
// session-bound checks. Ordering matters: tier comparisons rely on ordinal
// position (open < contributor < trusted < inner_circle).
export const clearanceTierEnum = pgEnum("clearance_tier", [
  "open", // no wallet / unauthenticated — public lanes only
  "contributor", // wallet connected + at least one accepted contribution
  "trusted", // sustained accepted contributions; sees draft incidents
  "inner_circle", // top-tier contributors; sees pre-publish OFAC/L2Beat diffs
]);

// What a contribution event represents in the points ledger. Each enum
// member maps to a fixed point award (see lib/clearance.ts CONTRIBUTION_POINTS).
// Keep this list aligned with the curator review flow — adding a new kind
// without updating the points map is a no-op for the ledger.
export const contributionEventKindEnum = pgEnum("contribution_event_kind", [
  "incident_accepted", // kind=incident intel approved
  "original_accepted", // kind=original intel approved
  "tip_accepted", // kind=tip intel approved
  "event_scoop_accepted", // off-platform event submission approved
  "event_paste_accepted", // already-on-Luma event submission approved
  "address_tag_accepted", // community-submitted address attribution accepted
  "vote_cast", // intel vote confirmed
  "prize_win_first", // monthly prize pool 1st place
  "prize_win_second", // monthly prize pool 2nd place
  "prize_win_third", // monthly prize pool 3rd place
  "curator_award", // discretionary curator-issued points
  // Awarded when a later approved intel references an address that this
  // submitter was first to flag (different submitter). Compounds the
  // address-graph moat — the original tipster keeps earning as new
  // investigations build on their attribution.
  "intel_cited",
  // First-person victim report approved by a curator. Smaller award than
  // intel_tip (5) because the verification bar is lower — but non-zero so
  // genuine victims still earn rep toward unlocking contributor tier.
  "loss_report_accepted",
  // Retained for forward compat. Product rule today: trust is monotonic up,
  // moderation handles bad actors via clearance freeze/ban, not score
  // deduction. awardContributionPoints rejects this kind at runtime.
  "retraction_clawback",
  // White-hat bounty claim accepted (funds recovered or arrest-leading info
  // verified). Higher reward than original/incident because the bar is real
  // money + curator + victim ack; see CONTRIBUTION_POINTS.
  "bounty_claim_accepted",
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
    // Case-insensitive uniqueness — both /api/subscribe and the bulk
    // importer lowercase before insert, but the DB enforces it.
    emailIdx: uniqueIndex("subscribers_email_idx").on(sql`lower(${t.email})`),
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
  // Tiptap document JSON. When present, the composer round-trips through the
  // block editor; htmlBody is always the source of truth at send time
  // (serialized from bodyDoc when the WYSIWYG composer saves).
  bodyDoc: jsonb("body_doc").$type<Record<string, unknown> | null>(),
  textBody: text("text_body"), // plain text fallback - improves deliverability
  status: campaignStatusEnum("status").notNull().default("draft"),
  // If targetTagIds is empty AND segmentId is null, campaign goes to all
  // active subscribers. If segmentId is set, the segment's filter wins.
  // Otherwise (legacy path) tag-set intersection.
  targetTagIds: jsonb("target_tag_ids").$type<string[]>().default([]),
  segmentId: uuid("segment_id").references((): AnyPgColumn => segments.id, {
    onDelete: "set null",
  }),
  // A/B subject test. When subjectB is set, the first abSampleSize recipients
  // are split 50/50 between subject and subjectB; the rest receive whichever
  // wins on abWinnerMetric ('open_rate' | 'click_rate') after a wait window.
  subjectB: text("subject_b"),
  abSampleSize: integer("ab_sample_size"),
  abWinnerMetric: text("ab_winner_metric"),
  abWinnerPickedAt: timestamp("ab_winner_picked_at"),
  abWinnerSubject: text("ab_winner_subject"),
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
  // First moment the worker started this send. Dedicated field so the
  // stuck-send sweeper isn't fooled by other updates bumping updatedAt.
  progressStartedAt: timestamp("progress_started_at"),
  sentAt: timestamp("sent_at"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// =====================================================================
// SEGMENTS — named saved targeting filters. Filter shape:
//   { tagIds?: string[], statuses?: string[], personas?: string[],
//     sources?: string[], includeUnconfirmed?: boolean }
// Resolved at send time so segment membership is always live.
// =====================================================================

export interface SegmentFilter {
  tagIds?: string[];
  statuses?: ("pending" | "active" | "unsubscribed" | "bounced" | "complained")[];
  personas?: string[];
  sources?: string[];
  includeUnconfirmed?: boolean;
}

export const segments = pgTable(
  "segments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description"),
    filterJson: jsonb("filter_json").$type<SegmentFilter>().notNull().default({}),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    nameIdx: uniqueIndex("segments_name_idx").on(t.name),
  }),
);

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
    // 'a' | 'b' for A/B split tests; null for normal sends.
    abVariant: text("ab_variant"),
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
    abVariantIdx: index("sends_ab_variant_idx").on(t.campaignId, t.abVariant),
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

// Inline figures / clips attached to an intel article. Distinct from
// `heroImageUrl` (single hero block above the article) — `media` is for
// charts, screenshots, address-graph snapshots, embedded video, etc. that
// the body text refers to. Renderer collapses these into a gallery block
// below the body when not referenced inline via markdown `![](url)`.
export type IntelMedia = {
  // image  → <img> figure with caption
  // video  → <video> for direct mp4/webm, OR iframe for YouTube/Vimeo (detected by URL)
  // embed  → trusted iframe for tweet/X/IPFS pinned content (allowlist enforced)
  kind: "image" | "video" | "embed";
  url: string;
  caption?: string;
  alt?: string;
  credit?: string;
  // Optional poster image (video thumbnail) used before play.
  poster?: string;
};

export type IntelPayload = {
  headline: string;
  body: string;
  // Optional one-line standfirst (subhead). Renders between headline and
  // hero on the article page and as the meta description fallback. Keeps
  // the SERP snippet tight when `body` opens with a long timestamp block.
  dek?: string;
  links?: string[];
  sources?: string[];
  category?: string;
  severity?: "low" | "medium" | "high" | "critical";
  anonymous?: boolean;
  // Hero block above the headline / lede. Either an image (most common) or
  // a video — when both are set, video wins. Drives the og:image meta tag
  // and the listing thumbnail. Caption + alt render under the figure.
  heroImageUrl?: string;
  heroVideoUrl?: string;
  heroPoster?: string;
  heroAlt?: string;
  heroCaption?: string;
  heroCredit?: string;
  // Inline media gallery. Up to 12 entries — enforced by the validator so
  // the JSONB payload stays under the column's soft limit and the gallery
  // stays scannable.
  media?: IntelMedia[];
  // When true, the `body` field is rendered as GitHub-flavored Markdown
  // (sanitized server-side). Defaults to false for backwards-compat with
  // the ~80 plain-text rows already in production; new intake defaults true.
  bodyFormat?: "plain" | "markdown";
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
  // Provenance tag for harvester-imported rows so a curator's hand-edited
  // postmortem isn't clobbered the next time the importer's headline
  // happens to match. Populated by import-defillama-hacks and
  // import-rekt-leaderboard; absent on community-submitted intel. The
  // UPDATE branches in those importers refuse to overwrite a row unless
  // sourceHarvester matches.
  sourceHarvester?: "defillama" | "rekt" | "gemini-editor";
  // Editorial heat flag — opt-in marker for high-temperature investigative
  // pieces (named-and-shamed accusations, active-operator exposes, things
  // we expect legal interest in). Renders as an animated fire chip on the
  // listing + detail. Distinct from `featured` (editorial bar / digest
  // eligibility) and `kind=incident` (postmortem flavor) — spicy is purely
  // a heat signal.
  spicy?: boolean;
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
  // Numeric prize pool in USD, when explicitly disclosed by the organizer.
  // Mirrors EventPayload.prizeUsd so the same filter ("show ≥$X hackathons")
  // works whether an entry was seeded as an event or submitted as a hackathon.
  prizeUsd?: number;
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
  // Multi-week run — optional. When omitted, the entry is treated as a
  // "rolling" or "TBC" listing and rendered as such on the cards. Keep
  // both set when the cohort dates are public.
  startsAt?: string; // ISO timestamp
  endsAt?: string;   // ISO timestamp
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
  // Headline cash check (excludes credits) the program writes when a team
  // joins, in USD. Lower bound for ranges. Skip when undisclosed or pure
  // mentorship-only. Powers numeric sort/filter on /accelerators.
  investmentUsd?: number;
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
  // Optional. When set, the listing buckets the entry as past/upcoming;
  // when omitted, the entry is rendered as rolling/TBC (typically used
  // for programs that take applications continuously — AGI House,
  // Founders Inc, AI Safety Camp — where no fixed cohort date applies).
  startsAt?: string;
  endsAt?: string;
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
  // Total cash stipend to the fellow over the program in USD, when explicitly
  // disclosed. Lower bound for ranges; excludes tuition/credits/research
  // budgets. Skip ("Competitive", "Negotiated", "Variable"). Powers numeric
  // sort/filter on /fellowships.
  stipendUsd?: number;
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

// Firsthand victim report. Categorically different from intel: a victim is
// not a journalist. Editorial bar / digest cron explicitly skip this type.
// On curator approval, each linked address gets a community-loss-report
// attribution (lowest precedence). The reputation gate lives at write-time:
// approved reports from open-tier submitters are *queued* and the attribution
// row is only written once the submitter crosses to contributor.
export type LossReportPayload = {
  // One-line summary: "Drained via fake Uniswap airdrop, Apr 12".
  headline: string;
  // Story: what happened, when, what evidence the submitter has.
  story: string;
  // How the assets left their control. Drives card chips and lets us slice
  // the dataset later ("show me all SIM-swap victims this quarter").
  lossType:
    | "phishing"
    | "drain"
    | "sim-swap"
    | "exploit"
    | "lost-keys"
    | "rug-pull"
    | "other";
  // ISO date of the loss event. Best-effort — victims rarely have a precise
  // timestamp, but the day they noticed is good enough.
  lossDate: string;
  // Self-claimed USD value lost. Used for the "$X user-reported" counter on
  // /graph, never the verified totals. Optional — many victims don't know.
  claimedUsd?: number;
  // Tx hashes, archive.org snapshots, blockchain explorer links — anything
  // the curator can use to validate the story.
  evidenceLinks?: string[];
  // Mirror of IntelPayload.anonymous. When true, no submitter row attaches —
  // approval skips the reputation gate (anonymous reports either get
  // written immediately or rejected by curator) since no rep exists to gate on.
  anonymous?: boolean;
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
  | FellowshipPayload
  | LossReportPayload;

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
    // Loss-report only. State machine for the reputation gate:
    //   null            — not a loss_report (or pre-approval)
    //   'queued'        — approved, but submitter is open-tier; address
    //                     attributions are NOT written until they cross to
    //                     contributor. Backfilled by awardContributionPoints
    //                     on tier promotion.
    //   'written'       — attributions have been written to address_attributions
    //   'rejected_low_tier' — reserved; not currently produced
    graphAttributionStatus: text("graph_attribution_status"),
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
    // Partial index — only loss_report rows ever populate this column. Used
    // by the tier-promotion backfill to find queued attribution work.
    graphAttributionStatusIdx: index("submissions_graph_attribution_status_idx").on(
      t.graphAttributionStatus,
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
    // Denormalized "primary attribution" — populated by the harvester layer
    // (see lib/address-attribution.ts) based on source precedence. Allows
    // graph queries to color/filter by category without joining
    // address_attributions. Full provenance lives in that table.
    category: addressCategoryEnum("category"),
    ownerName: text("owner_name"),
    ownerKind: addressOwnerKindEnum("owner_kind"),
    primarySource: addressAttributionSourceEnum("primary_source"),
    // Confidence in the primary attribution (0-100). Sanctions lists are 100.
    confidence: integer("confidence"),
    // Optional USD balance estimate — useful for ranking the famous-lost
    // wallets on a leaderboard ("8000 BTC stuck since 2011 = $X").
    balanceEstimateUsd: numeric("balance_estimate_usd", {
      precision: 18,
      scale: 2,
    }),
    // Native-token amount + symbol at this address. Powers the per-token
    // counter on /graph ("174,783 BTC tracked · 513,774 ETH frozen").
    // Symbol stored as uppercase token ticker; amount can be fractional.
    nativeAmount: numeric("native_amount", { precision: 38, scale: 8 }),
    nativeSymbol: text("native_symbol"),
    firstSeenAt: timestamp("first_seen_at"),
    lastVerifiedAt: timestamp("last_verified_at"),
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
    // Lets the graph layer scan "all sanctioned addresses on Ethereum" or
    // "all exchange wallets" without a sequential scan as the table grows
    // into the hundreds of thousands of OFAC + DefiLlama labels.
    categoryIdx: index("addresses_category_idx").on(t.category),
    ownerKindIdx: index("addresses_owner_kind_idx").on(t.ownerKind),
  }),
);

// =====================================================================
// ADDRESS ATTRIBUTIONS — multi-source provenance for each address.
//
// One address can be attributed by many sources (OFAC says "Lazarus", EU
// says "DPRK actor", a community submission adds "drained Atomic Wallet").
// Keeping every claim lets us show provenance in the UI ("OFAC + 2 others")
// and recompute the denormalized `addresses.category` when precedence rules
// change. Harvesters upsert on (address_id, source, source_ref).
// =====================================================================

export const addressAttributions = pgTable(
  "address_attributions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    addressId: uuid("address_id")
      .notNull()
      .references(() => addresses.id, { onDelete: "cascade" }),
    source: addressAttributionSourceEnum("source").notNull(),
    // Source-specific identifier so re-running a harvester updates rather
    // than duplicates. OFAC uses entity numbers ("36052"), DefiLlama uses
    // protocol slugs ("aave"), curated entries use a stable slug.
    sourceRef: text("source_ref"),
    sourceUrl: text("source_url"),
    category: addressCategoryEnum("category"),
    ownerName: text("owner_name"),
    ownerKind: addressOwnerKindEnum("owner_kind"),
    label: text("label"),
    notes: text("notes"),
    confidence: integer("confidence"),
    reportedAt: timestamp("reported_at"),
    harvestedAt: timestamp("harvested_at").defaultNow().notNull(),
  },
  (t) => ({
    addressIdx: index("address_attributions_address_idx").on(t.addressId),
    sourceIdx: index("address_attributions_source_idx").on(t.source),
    // Idempotent upsert key — one row per (address, source, source_ref).
    // sourceRef nullable rows (e.g. curated) dedupe by (address, source).
    addrSourceRefIdx: uniqueIndex("address_attributions_addr_source_ref_idx").on(
      t.addressId,
      t.source,
      t.sourceRef,
    ),
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

// Submitters are the "people" side of the platform. Identity is anchored
// on a Magic Link dedicated wallet (email-onboarded, no seed phrase) — the
// user enters an email, Magic mints/restores their on-chain wallet behind
// an OTP challenge, and we record (magicIssuer, walletAddress, email) as
// the contributor identity. Email is the entry point; wallet stays
// canonical for the points ledger and the address-graph moat. Anonymous
// tips bypass this table entirely.
export const submitters = pgTable(
  "submitters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email"),
    // Magic Link issuer DID — stable cross-session identifier from the Magic
    // Admin SDK (`getMetadataByIssuer`). Format: `did:ethr:0x...`. Unique
    // when present.
    magicIssuer: text("magic_issuer"),
    // Lowercased hex wallet address from Magic. Unique when present; the
    // address-graph layer indexes these as nodes alongside externally-
    // attributed addresses.
    walletAddress: text("wallet_address"),
    walletChain: text("wallet_chain").default("ethereum"),
    displayHandle: text("display_handle"),
    // URL slug for /contributors/[slug]. Generated server-side from handle
    // or wallet at insert time.
    slug: text("slug").notNull(),
    bio: text("bio"),
    // Running points total. Recomputable from contribution_events but kept
    // denormalized for fast tier checks on every gated route hit.
    points: integer("points").notNull().default(0),
    clearanceTier: clearanceTierEnum("clearance_tier")
      .notNull()
      .default("open"),
    // Lifetime sign-in count, bumped in createMagicSession. Powers the
    // admin Contributors analytics view.
    loginCount: integer("login_count").notNull().default(0),
    lastLoginAt: timestamp("last_login_at"),
    // Bounty-surface strike count. Bad-faith / doxx-attempt bounty claim
    // verdicts increment this; reaching 2 sets bountyBannedAt and blocks
    // future claim submissions. Scoped to the bounty surface — a banned
    // claimant can still submit intel. See project_bounty_bad_faith_policy.md.
    bountyStrikes: integer("bounty_strikes").notNull().default(0),
    bountyBannedAt: timestamp("bounty_banned_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    // Partial unique — Postgres treats multiple NULLs as distinct in a
    // regular unique, so a bug that inserts an email-less submitter could
    // write unlimited rows. The IS NOT NULL filter preserves the dedup
    // intent while leaving NULL semantics intact.
    emailIdx: uniqueIndex("submitters_email_idx")
      .on(sql`lower(${t.email})`)
      .where(sql`${t.email} IS NOT NULL`),
    magicIssuerIdx: uniqueIndex("submitters_magic_issuer_idx")
      .on(t.magicIssuer)
      .where(sql`${t.magicIssuer} IS NOT NULL`),
    walletIdx: uniqueIndex("submitters_wallet_idx").on(
      sql`lower(${t.walletAddress})`,
    ),
    slugIdx: uniqueIndex("submitters_slug_idx").on(t.slug),
    pointsIdx: index("submitters_points_idx").on(t.points),
    lastLoginIdx: index("submitters_last_login_idx").on(t.lastLoginAt),
  }),
);

// One-time-passcode challenges issued during the email-OTP step of the
// Magic Link sign-in flow. The code itself is hashed at rest (HMAC-SHA256
// with SESSION_PASSWORD as key) so a leaked DB snapshot cannot replay
// live challenges. A successful verify sets `verified_at` and also drops
// a short-lived sealed cookie that the Magic login endpoint reads — the
// row is the audit record, the cookie is the load-bearing check.
export const emailVerifications = pgTable(
  "email_verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    // Bumped on each verify attempt — hitting MAX_ATTEMPTS invalidates the
    // row, forcing the user to request a fresh code rather than letting an
    // attacker brute-force the 6-digit space.
    attempts: integer("attempts").notNull().default(0),
    verifiedAt: timestamp("verified_at"),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    // Lookup pattern: "most recent non-expired challenge for this email"
    emailExpiresIdx: index("email_verifications_email_expires_idx").on(
      sql`lower(${t.email})`,
      t.expiresAt,
    ),
    createdAtIdx: index("email_verifications_created_at_idx").on(t.createdAt),
  }),
);

// Append-only ledger of every point-earning action a submitter has taken.
// Source of truth for `submitters.points` (which is a denormalized cache).
// Curator-approved actions write here at the moment of approval; clawbacks
// write negative-point rows rather than mutating prior records.
export const contributionEvents = pgTable(
  "contribution_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    submitterId: uuid("submitter_id")
      .notNull()
      .references(() => submitters.id, { onDelete: "cascade" }),
    kind: contributionEventKindEnum("kind").notNull(),
    points: integer("points").notNull(),
    // Optional FK — most events trace back to a submission, but curator
    // awards and vote_cast events may not.
    submissionId: uuid("submission_id").references(() => submissions.id, {
      onDelete: "set null",
    }),
    // Curator who approved the action. NULL for system-issued events
    // (votes, prize-pool settlements).
    awardedByUserId: uuid("awarded_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    awardedAt: timestamp("awarded_at").defaultNow().notNull(),
  },
  (t) => ({
    submitterIdx: index("contribution_events_submitter_idx").on(t.submitterId),
    submitterAwardedIdx: index("contribution_events_submitter_awarded_idx").on(
      t.submitterId,
      t.awardedAt,
    ),
    submissionIdx: index("contribution_events_submission_idx").on(
      t.submissionId,
    ),
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
  attributions: many(addressAttributions),
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

export const addressAttributionsRelations = relations(
  addressAttributions,
  ({ one }) => ({
    address: one(addresses, {
      fields: [addressAttributions.addressId],
      references: [addresses.id],
    }),
  }),
);

export const submittersRelations = relations(submitters, ({ many }) => ({
  submissions: many(submissions),
  contributionEvents: many(contributionEvents),
}));

export const contributionEventsRelations = relations(
  contributionEvents,
  ({ one }) => ({
    submitter: one(submitters, {
      fields: [contributionEvents.submitterId],
      references: [submitters.id],
    }),
    submission: one(submissions, {
      fields: [contributionEvents.submissionId],
      references: [submissions.id],
    }),
    awardedBy: one(users, {
      fields: [contributionEvents.awardedByUserId],
      references: [users.id],
    }),
  }),
);

// =====================================================================
// HACK TRACES — automated victim-driven outbound flow traces. User
// submits a drained wallet; the runner walks outbound ETH+ERC-20 transfers
// up to `max_hops` deep, terminating at known-attributed addresses,
// dust thresholds, or depth. Each hop is a row in hack_trace_hops so
// the result page can render the flow without re-hitting Etherscan.
// Counterparty addresses get written into address_attributions as
// `victim-trace`, joining the community-class moat layer.
// =====================================================================

export const hackTraces = pgTable(
  "hack_traces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicId: text("public_id")
      .notNull()
      .default(sql`encode(gen_random_bytes(8), 'hex')`),
    chain: text("chain").notNull(),
    rootAddress: text("root_address").notNull(),
    victimLabel: text("victim_label"),
    lossUsd: numeric("loss_usd", { precision: 18, scale: 2 }),
    lossTokenSymbol: text("loss_token_symbol"),
    submitterEmail: text("submitter_email"),
    submitterIp: text("submitter_ip"),
    // pending → running → complete | failed
    status: text("status").notNull().default("pending"),
    failureReason: text("failure_reason"),
    maxHops: integer("max_hops").notNull().default(3),
    hopsExplored: integer("hops_explored").notNull().default(0),
    terminalCount: integer("terminal_count").notNull().default(0),
    totalOutflowNative: numeric("total_outflow_native", {
      precision: 38,
      scale: 0,
    }),
    totalOutflowTokenSymbol: text("total_outflow_token_symbol"),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    publicIdIdx: uniqueIndex("hack_traces_public_id_idx").on(t.publicId),
    statusIdx: index("hack_traces_status_idx").on(t.status),
    chainRootIdx: index("hack_traces_chain_root_idx").on(t.chain, t.rootAddress),
  }),
);

export const hackTraceHops = pgTable(
  "hack_trace_hops",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    traceId: uuid("trace_id")
      .notNull()
      .references(() => hackTraces.id, { onDelete: "cascade" }),
    // 1 = direct outflow from root. Capped at trace.maxHops.
    depth: integer("depth").notNull(),
    fromAddressId: uuid("from_address_id")
      .notNull()
      .references(() => addresses.id, { onDelete: "cascade" }),
    toAddressId: uuid("to_address_id")
      .notNull()
      .references(() => addresses.id, { onDelete: "cascade" }),
    txHash: text("tx_hash").notNull(),
    blockNumber: numeric("block_number", { precision: 20, scale: 0 }),
    // Smallest-unit amount (wei for ETH, base units for ERC-20). Stored as
    // numeric(78,0) so we never truncate a wei value at display time.
    amountRaw: numeric("amount_raw", { precision: 78, scale: 0 }),
    tokenSymbol: text("token_symbol"),
    tokenAddress: text("token_address"),
    tokenDecimals: integer("token_decimals"),
    // USD valuation at the time of the tx (when available). Populated for
    // terminal "where is it today" snapshots using current spot price;
    // historical hop pricing is a v2 enhancement.
    amountUsd: numeric("amount_usd", { precision: 18, scale: 2 }),
    txTimestamp: timestamp("tx_timestamp"),
    // null = transit hop; else one of 'attribution_match' | 'dust' | 'depth'
    // | 'still_moving'. Renders as a chip on the results page.
    terminalReason: text("terminal_reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    traceIdx: index("hack_trace_hops_trace_idx").on(t.traceId, t.depth),
    fromIdx: index("hack_trace_hops_from_idx").on(t.fromAddressId),
    toIdx: index("hack_trace_hops_to_idx").on(t.toAddressId),
    dedupeIdx: uniqueIndex("hack_trace_hops_dedupe_idx").on(
      t.traceId,
      t.txHash,
      t.fromAddressId,
      t.toAddressId,
    ),
  }),
);

export const hackTracesRelations = relations(hackTraces, ({ many }) => ({
  hops: many(hackTraceHops),
}));

export const hackTraceHopsRelations = relations(hackTraceHops, ({ one }) => ({
  trace: one(hackTraces, {
    fields: [hackTraceHops.traceId],
    references: [hackTraces.id],
  }),
  fromAddress: one(addresses, {
    fields: [hackTraceHops.fromAddressId],
    references: [addresses.id],
  }),
  toAddress: one(addresses, {
    fields: [hackTraceHops.toAddressId],
    references: [addresses.id],
  }),
}));

// =====================================================================
// RECOVERY BOUNTIES — victim-posted USDC bounties for white-hat info that
// leads to fund recovery (or, with a filed police report, arrest). Custody
// rail is currently paused (Circle DCW was ripped 2026-05-18, replacement
// not yet picked) — `/bounties/new` and POST /api/bounties are gated
// behind BOUNTY_CUSTODY_RAIL_ENABLED. Claims gated to trusted+ tier;
// 2-strike bad-faith ban per project_bounty_bad_faith_policy.md.
// Accepted-claim target addresses land in address_attributions with
// source='bounty-claim'.
// =====================================================================

export const bountyStatusEnum = pgEnum("bounty_status", [
  "draft",        // victim created, not yet funded
  "funded",       // USDC arrived in custodial escrow wallet
  "open",         // accepting claims
  "adjudicating", // ≥1 claim under curator review
  "paid",         // payout complete (full or partial)
  "refunded",     // expired/cancelled; victim refunded
  "expired",      // past expires_at with no valid claims
]);

export const bountyKindEnum = pgEnum("bounty_kind", [
  "recovery",      // % of recovered funds returned to victim
  "info_recovery", // flat USDC for info that leads to recovery
  "info_arrest",   // flat USDC, requires police-report attestation
]);

export const bountyClaimStatusEnum = pgEnum("bounty_claim_status", [
  "submitted",
  "under_review",
  "needs_info",
  "accepted",
  "partial", // partial recovery confirmed
  "rejected",
  "withdrawn",
]);

// Strike-issuing reasons are `bad_faith` and `doxx_attempt`. Everything else
// is a good-faith failure with no penalty. Source of truth is
// BOUNTY_CLAIM_STRIKE_REASONS in lib/bounty.ts.
export const bountyClaimRejectionReasonEnum = pgEnum(
  "bounty_claim_rejection_reason",
  [
    "insufficient_evidence",
    "duplicate",
    "out_of_scope",
    "bad_faith",
    "doxx_attempt",
  ],
);

// Sealed evidence package the claimant submits. Only curator + victim should
// read this — the public bounty page never renders it. Validated in
// lib/bounty.ts before insert.
export type BountyClaimEvidence = {
  targetAddresses: string[]; // 0x… hex, lowercased
  suspectedEntity?: string;
  narrative: string;
  citedSubmissionIds?: string[];
  attachmentUrls?: string[];
  chain?: string; // defaults to "ethereum" downstream
};

export const bounties = pgTable(
  "bounties",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicId: text("public_id")
      .notNull()
      .default(sql`encode(gen_random_bytes(8), 'hex')`),
    // Hangs off a hack_trace for provenance. Nullable for free-standing
    // loss-report bounties (v2).
    hackTraceId: uuid("hack_trace_id").references(() => hackTraces.id, {
      onDelete: "set null",
    }),
    victimEmail: text("victim_email").notNull(),
    victimSubmitterId: uuid("victim_submitter_id").references(
      () => submitters.id,
      { onDelete: "set null" },
    ),
    kind: bountyKindEnum("kind").notNull(),
    // Basis points (1–10000). NULL unless kind=recovery.
    recoveryPercentBps: integer("recovery_percent_bps"),
    // Flat USDC amount. NULL unless kind ∈ {info_recovery, info_arrest}.
    flatAmountUsdc: numeric("flat_amount_usdc", { precision: 18, scale: 2 }),
    escrowedAmountUsdc: numeric("escrowed_amount_usdc", {
      precision: 18,
      scale: 2,
    })
      .notNull()
      .default("0"),
    fundingTxHash: text("funding_tx_hash"),
    status: bountyStatusEnum("status").notNull().default("draft"),
    policeReportFiled: boolean("police_report_filed").notNull().default(false),
    policeReportRef: text("police_report_ref"),
    termsAcceptedAt: timestamp("terms_accepted_at"),
    expiresAt: timestamp("expires_at").notNull(),
    description: text("description").notNull(),
    // Victim email-ownership proof. Set when the creator (a) has a Magic
    // session whose email matches victimEmail, or (b) completes an
    // email-OTP round and the cookie is consumed at create-time or via
    // /verify-victim. The /fund route refuses to flip draft → open while
    // this is null — funds may sit in escrow but the bounty stays private
    // until the actual victim attests.
    victimVerifiedAt: timestamp("victim_verified_at"),
    // SHA-256 of a 32-byte random token returned only in the create
    // response (and the funding-instructions email). Gates anon-victim
    // access to their own draft without requiring a Magic account.
    victimAccessTokenHash: text("victim_access_token_hash"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    publicIdIdx: uniqueIndex("bounties_public_id_idx").on(t.publicId),
    statusIdx: index("bounties_status_idx").on(t.status),
    hackTraceIdx: index("bounties_hack_trace_idx").on(t.hackTraceId),
    victimSubmitterIdx: index("bounties_victim_submitter_idx").on(
      t.victimSubmitterId,
    ),
    expiresAtIdx: index("bounties_expires_at_idx").on(t.expiresAt),
    victimVerifiedIdx: index("bounties_victim_verified_idx").on(
      t.victimVerifiedAt,
    ),
    victimTokenHashIdx: index("bounties_victim_token_hash_idx").on(
      t.victimAccessTokenHash,
    ),
  }),
);

export const bountyClaims = pgTable(
  "bounty_claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicId: text("public_id")
      .notNull()
      .default(sql`encode(gen_random_bytes(8), 'hex')`),
    bountyId: uuid("bounty_id")
      .notNull()
      .references(() => bounties.id, { onDelete: "cascade" }),
    claimantSubmitterId: uuid("claimant_submitter_id")
      .notNull()
      .references(() => submitters.id, { onDelete: "restrict" }),
    // Snapshot for audit — survives subsequent tier moves.
    claimantTierAtSubmit: clearanceTierEnum("claimant_tier_at_submit").notNull(),
    evidencePayload: jsonb("evidence_payload")
      .$type<BountyClaimEvidence>()
      .notNull(),
    bondAmountUsdc: numeric("bond_amount_usdc", { precision: 18, scale: 2 })
      .notNull()
      .default("0"),
    bondTxHash: text("bond_tx_hash"),
    bondRefundedTxHash: text("bond_refunded_tx_hash"),
    status: bountyClaimStatusEnum("status").notNull().default("submitted"),
    rejectionReason: bountyClaimRejectionReasonEnum("rejection_reason"),
    strikeIssued: boolean("strike_issued").notNull().default(false),
    curatorNotes: text("curator_notes"),
    victimAckedAt: timestamp("victim_acked_at"),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at"),
    submittedAt: timestamp("submitted_at").defaultNow().notNull(),
    // Bumped any time the row's status or curator notes change. Powers
    // the "oldest needing attention" sort on the admin curator queue.
    lastTouchedAt: timestamp("last_touched_at").defaultNow().notNull(),
  },
  (t) => ({
    publicIdIdx: uniqueIndex("bounty_claims_public_id_idx").on(t.publicId),
    bountyIdx: index("bounty_claims_bounty_idx").on(t.bountyId),
    claimantIdx: index("bounty_claims_claimant_idx").on(t.claimantSubmitterId),
    statusIdx: index("bounty_claims_status_idx").on(t.status),
    lastTouchedIdx: index("bounty_claims_last_touched_idx").on(t.lastTouchedAt),
    // One claim per (bounty, claimant) — revisions reuse the row.
    bountyClaimantIdx: uniqueIndex("bounty_claims_bounty_claimant_idx").on(
      t.bountyId,
      t.claimantSubmitterId,
    ),
  }),
);

// Payee kinds. Free-form text in the DB (no enum churn for new payee types
// in the future); validated against this list in lib/bounty.ts at insert time.
export const BOUNTY_PAYOUT_PAYEE_KINDS = [
  "claimant",
  "victim_refund",
  "platform_fee",
  "bond_refund",
  "bond_slash",
] as const;
export type BountyPayoutPayeeKind = (typeof BOUNTY_PAYOUT_PAYEE_KINDS)[number];

export const bountyPayouts = pgTable(
  "bounty_payouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bountyId: uuid("bounty_id")
      .notNull()
      .references(() => bounties.id, { onDelete: "cascade" }),
    bountyClaimId: uuid("bounty_claim_id").references(() => bountyClaims.id, {
      onDelete: "set null",
    }),
    amountUsdc: numeric("amount_usdc", { precision: 18, scale: 2 }).notNull(),
    payoutTxHash: text("payout_tx_hash"),
    payeeKind: text("payee_kind").$type<BountyPayoutPayeeKind>().notNull(),
    payeeSubmitterId: uuid("payee_submitter_id").references(
      () => submitters.id,
      { onDelete: "set null" },
    ),
    status: text("status").notNull().default("pending"), // pending | sent | failed
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    sentAt: timestamp("sent_at"),
  },
  (t) => ({
    bountyIdx: index("bounty_payouts_bounty_idx").on(t.bountyId),
    claimIdx: index("bounty_payouts_claim_idx").on(t.bountyClaimId),
    statusIdx: index("bounty_payouts_status_idx").on(t.status),
  }),
);

export const bountiesRelations = relations(bounties, ({ one, many }) => ({
  hackTrace: one(hackTraces, {
    fields: [bounties.hackTraceId],
    references: [hackTraces.id],
  }),
  victimSubmitter: one(submitters, {
    fields: [bounties.victimSubmitterId],
    references: [submitters.id],
  }),
  claims: many(bountyClaims),
  payouts: many(bountyPayouts),
}));

export const bountyClaimsRelations = relations(bountyClaims, ({ one, many }) => ({
  bounty: one(bounties, {
    fields: [bountyClaims.bountyId],
    references: [bounties.id],
  }),
  claimant: one(submitters, {
    fields: [bountyClaims.claimantSubmitterId],
    references: [submitters.id],
  }),
  reviewer: one(users, {
    fields: [bountyClaims.reviewedByUserId],
    references: [users.id],
  }),
  payouts: many(bountyPayouts),
}));

export const bountyPayoutsRelations = relations(bountyPayouts, ({ one }) => ({
  bounty: one(bounties, {
    fields: [bountyPayouts.bountyId],
    references: [bounties.id],
  }),
  claim: one(bountyClaims, {
    fields: [bountyPayouts.bountyClaimId],
    references: [bountyClaims.id],
  }),
  payee: one(submitters, {
    fields: [bountyPayouts.payeeSubmitterId],
    references: [submitters.id],
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
export type AddressAttribution = typeof addressAttributions.$inferSelect;
export type NewAddressAttribution = typeof addressAttributions.$inferInsert;
export type AddressCategory =
  (typeof addressCategoryEnum.enumValues)[number];
export type AddressOwnerKind =
  (typeof addressOwnerKindEnum.enumValues)[number];
export type AddressAttributionSource =
  (typeof addressAttributionSourceEnum.enumValues)[number];
export type IntelVote = typeof intelVotes.$inferSelect;
export type VoteToken = typeof voteTokens.$inferSelect;
export type MonthlyPrize = typeof monthlyPrizes.$inferSelect;
export type Submitter = typeof submitters.$inferSelect;
export type NewSubmitter = typeof submitters.$inferInsert;
export type ContributionEvent = typeof contributionEvents.$inferSelect;
export type EmailVerification = typeof emailVerifications.$inferSelect;
export type NewEmailVerification = typeof emailVerifications.$inferInsert;
export type NewContributionEvent = typeof contributionEvents.$inferInsert;
export type ClearanceTier = (typeof clearanceTierEnum.enumValues)[number];
export type ContributionEventKind =
  (typeof contributionEventKindEnum.enumValues)[number];
export type HackTrace = typeof hackTraces.$inferSelect;
export type NewHackTrace = typeof hackTraces.$inferInsert;
export type HackTraceHop = typeof hackTraceHops.$inferSelect;
export type NewHackTraceHop = typeof hackTraceHops.$inferInsert;
export type Bounty = typeof bounties.$inferSelect;
export type NewBounty = typeof bounties.$inferInsert;
export type BountyStatus = (typeof bountyStatusEnum.enumValues)[number];
export type BountyKind = (typeof bountyKindEnum.enumValues)[number];
export type BountyClaim = typeof bountyClaims.$inferSelect;
export type NewBountyClaim = typeof bountyClaims.$inferInsert;
export type BountyClaimStatus =
  (typeof bountyClaimStatusEnum.enumValues)[number];
export type BountyClaimRejectionReason =
  (typeof bountyClaimRejectionReasonEnum.enumValues)[number];
export type BountyPayout = typeof bountyPayouts.$inferSelect;
export type NewBountyPayout = typeof bountyPayouts.$inferInsert;
export type HackTraceStatus = "pending" | "running" | "complete" | "failed";
export type HackTraceTerminalReason =
  | "attribution_match"
  | "dust"
  | "depth"
  | "still_moving";

// Persona tag slugs / labels live in /src/lib/personas.ts so client
// components (e.g. the landing-page signup form) can import them without
// pulling pg-core into the client bundle.
export { PERSONA_SLUGS, PERSONA_LABELS } from "../personas";
export type { PersonaSlug } from "../personas";
