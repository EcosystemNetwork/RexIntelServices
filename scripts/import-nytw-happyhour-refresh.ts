/**
 * Refresh import for NYC Tech Week 2025 — Happy Hour: AI Personalized Bots.
 *
 * Source: /tmp/nytw-happyhour-refresh.csv (post-event re-export, June 7).
 * Same event slug + tag pair as scripts/import-event-rsvps.ts — this run picks up
 * any guests that registered after the initial import and adds the new
 * Status / Checked in / Plus ones / RSVP date columns to metadata.
 *
 * Rules:
 *   - Status="Approved" → import as active subscriber
 *   - Status="Can't Go" (declined-equivalent) → skipped
 *   - source = event-nytw-2025-happyhour-ai-bots (preserved from prior import)
 *   - tags   = umbrella `nyc-tech-week-2025` + per-event `nytw-2025-happyhour-ai-bots`
 *
 * Run:  npx tsx --env-file=.env scripts/import-nytw-happyhour-refresh.ts
 */

import "dotenv/config";
import { readFileSync } from "fs";
import Papa from "papaparse";
import { inArray } from "drizzle-orm";
import {
  db,
  subscribers,
  suppressions,
  tags,
  subscriberTags,
} from "../src/lib/db";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CSV_PATH = "/tmp/nytw-happyhour-refresh.csv";
const SOURCE_SLUG = "event-nytw-2025-happyhour-ai-bots";

const EVENT_TAG = {
  name: "nytw-2025-happyhour-ai-bots",
  description:
    "NYC Tech Week 2025 — Happy Hour: AI Personalized Bots (June 2025)",
};
const UMBRELLA_TAG = {
  name: "nyc-tech-week-2025",
  description: "All NYC Tech Week 2025 RSVPs (any event)",
};

interface ParsedRow {
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
  checkedIn: boolean;
  plusOnes: string | null;
  rsvpDate: string | null;
  linkedin: string | null;
  company: string | null;
  jobTitle: string | null;
}

function splitName(full: string): {
  firstName: string | null;
  lastName: string | null;
} {
  const trimmed = full.trim();
  if (!trimmed) return { firstName: null, lastName: null };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function normalizeStatus(raw: string): string {
  // Luma exports can ship NBSP ( ) inside "Can't Go" — collapse all
  // whitespace and lowercase before comparing.
  return raw.replace(/\s+/g, " ").trim().toLowerCase();
}

function parseFile(path: string): ParsedRow[] {
  const text = readFileSync(path, "utf8");
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().replace(/^﻿/, ""),
  });
  const rows: ParsedRow[] = [];
  let skippedDeclined = 0;
  let skippedNoEmail = 0;
  let skippedInvalidEmail = 0;
  for (const r of parsed.data) {
    const email = (r["What is your email?"] ?? "").trim().toLowerCase();
    if (!email) {
      skippedNoEmail++;
      continue;
    }
    if (!EMAIL_REGEX.test(email)) {
      skippedInvalidEmail++;
      continue;
    }
    const status = normalizeStatus(r.Status ?? "");
    if (status !== "approved") {
      skippedDeclined++;
      continue;
    }
    const { firstName, lastName } = splitName(r.Name ?? "");
    rows.push({
      email,
      firstName,
      lastName,
      status,
      checkedIn: (r["Checked in"] ?? "").trim().toLowerCase() === "yes",
      plusOnes: (r["Plus ones"] ?? "").trim() || null,
      rsvpDate: (r["RSVP date"] ?? "").trim() || null,
      linkedin: (r["What is your LinkedIn?"] ?? "").trim() || null,
      company: (r["What is the name of your company?"] ?? "").trim() || null,
      jobTitle: (r["What is your job title?"] ?? "").trim() || null,
    });
  }
  console.log(
    `  parsed ${rows.length} keeper rows ` +
      `(skipped ${skippedDeclined} declined/cant-go, ${skippedNoEmail} no-email, ${skippedInvalidEmail} invalid-email)`,
  );
  return rows;
}

async function upsertTag(name: string, description: string): Promise<string> {
  const [existing] = await db
    .select({ id: tags.id })
    .from(tags)
    .where(inArray(tags.name, [name]))
    .limit(1);
  if (existing) return existing.id;
  const [created] = await db
    .insert(tags)
    .values({ name, description, kind: "interest" })
    .onConflictDoNothing()
    .returning({ id: tags.id });
  if (created) return created.id;
  const [row] = await db
    .select({ id: tags.id })
    .from(tags)
    .where(inArray(tags.name, [name]))
    .limit(1);
  return row!.id;
}

async function main() {
  console.log("Refreshing NYTW 2025 Happy Hour: AI Personalized Bots guest list…\n");

  const eventTagId = await upsertTag(EVENT_TAG.name, EVENT_TAG.description);
  const umbrellaTagId = await upsertTag(
    UMBRELLA_TAG.name,
    UMBRELLA_TAG.description,
  );

  const rows = parseFile(CSV_PATH);

  const byEmail = new Map<string, ParsedRow>();
  for (const r of rows) {
    if (!byEmail.has(r.email)) byEmail.set(r.email, r);
  }
  console.log(`  ${byEmail.size} unique emails after dedup\n`);

  const allEmails = Array.from(byEmail.keys());
  const suppressed = await db
    .select({ email: suppressions.email })
    .from(suppressions)
    .where(inArray(suppressions.email, allEmails));
  const suppressedSet = new Set(
    suppressed.map((s) => s.email.toLowerCase()),
  );
  if (suppressedSet.size > 0) {
    console.log(`  Skipping ${suppressedSet.size} suppressed addresses`);
    for (const e of suppressedSet) byEmail.delete(e);
  }

  const CHUNK = 500;
  const toInsert = Array.from(byEmail.values()).map((v) => ({
    email: v.email,
    firstName: v.firstName,
    lastName: v.lastName,
    source: SOURCE_SLUG,
    status: "active" as const,
    metadata: {
      linkedin: v.linkedin,
      company: v.company,
      jobTitle: v.jobTitle,
      checkedIn: v.checkedIn,
      plusOnes: v.plusOnes,
      rsvpDate: v.rsvpDate,
      approvalStatus: v.status,
      importedFrom: "nytw-2025-happyhour-ai-bots-refresh",
      importedAt: new Date().toISOString(),
    } as Record<string, unknown>,
  }));

  let inserted = 0;
  const idsByEmail = new Map<string, string>();
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const chunk = toInsert.slice(i, i + CHUNK);
    const result = await db
      .insert(subscribers)
      .values(chunk)
      .onConflictDoNothing()
      .returning({ id: subscribers.id, email: subscribers.email });
    inserted += result.length;
    for (const row of result) idsByEmail.set(row.email, row.id);
  }

  const allRows = await db
    .select({ id: subscribers.id, email: subscribers.email })
    .from(subscribers)
    .where(inArray(subscribers.email, Array.from(byEmail.keys())));
  for (const r of allRows) idsByEmail.set(r.email, r.id);

  const tagPairs: { subscriberId: string; tagId: string }[] = [];
  for (const email of byEmail.keys()) {
    const subId = idsByEmail.get(email);
    if (!subId) continue;
    tagPairs.push({ subscriberId: subId, tagId: umbrellaTagId });
    tagPairs.push({ subscriberId: subId, tagId: eventTagId });
  }
  for (let i = 0; i < tagPairs.length; i += CHUNK) {
    const chunk = tagPairs.slice(i, i + CHUNK);
    await db.insert(subscriberTags).values(chunk).onConflictDoNothing();
  }

  console.log(`\n✓ Done.`);
  console.log(`  Subscribers inserted (new): ${inserted}`);
  console.log(`  Subscribers touched (total): ${idsByEmail.size}`);
  console.log(`  Tag attachments: ${tagPairs.length}`);
  console.log(`  Tags used: ${UMBRELLA_TAG.name}, ${EVENT_TAG.name}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
