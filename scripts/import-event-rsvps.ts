/**
 * One-shot importer for NYC Tech Week 2025 RSVP CSVs.
 *
 * Source files at /tmp/nytw-*.csv. Each file is one event's RSVP export.
 * Imports every valid email as an active subscriber:
 *   - source = the event slug (one event "wins" per subscriber — the first
 *     event we see them in. Their full event participation lives in tags.)
 *   - tags   = umbrella `nyc-tech-week-2025` + per-event tag
 *   - metadata.linkedin / .company / .jobTitle preserved for future export
 *
 * Run:  npx tsx --env-file=.env scripts/import-event-rsvps.ts
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

interface EventFile {
  path: string;
  sourceSlug: string;
  tagName: string;
  tagDescription: string;
}

const FILES: EventFile[] = [
  {
    path: "/tmp/nytw-happyhour.csv",
    sourceSlug: "event-nytw-2025-happyhour-ai-bots",
    tagName: "nytw-2025-happyhour-ai-bots",
    tagDescription:
      "NYC Tech Week 2025 — Happy Hour: AI Personalized Bots (June 2025)",
  },
  {
    path: "/tmp/nytw-innovate.csv",
    sourceSlug: "event-nytw-2025-innovate-fintech-ai",
    tagName: "nytw-2025-innovate-fintech-ai",
    tagDescription:
      "NYC Tech Week 2025 — Innovate for People + Planet: Fintech & AI (June 2025)",
  },
  {
    path: "/tmp/nytw-bridging.csv",
    sourceSlug: "event-nytw-2025-bridging-eras-wealth",
    tagName: "nytw-2025-bridging-eras-wealth",
    tagDescription:
      "NYC Tech Week 2025 — Bridging Eras: AI, Legacy & Wealth (June 2025)",
  },
];

const UMBRELLA_TAG = {
  name: "nyc-tech-week-2025",
  description: "All NYC Tech Week 2025 RSVPs (any event)",
};

interface ParsedRow {
  email: string;
  firstName: string | null;
  lastName: string | null;
  linkedin: string | null;
  company: string | null;
  jobTitle: string | null;
}

function splitName(full: string): { firstName: string | null; lastName: string | null } {
  const trimmed = full.trim();
  if (!trimmed) return { firstName: null, lastName: null };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function parseFile(path: string): ParsedRow[] {
  const text = readFileSync(path, "utf8");
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  const rows: ParsedRow[] = [];
  for (const r of parsed.data) {
    const email = (r["What is your email?"] ?? "").trim().toLowerCase();
    if (!email || !EMAIL_REGEX.test(email)) continue;
    const { firstName, lastName } = splitName(r["Name"] ?? "");
    rows.push({
      email,
      firstName,
      lastName,
      linkedin: (r["What is your LinkedIn?"] ?? "").trim() || null,
      company: (r["What is the name of your company?"] ?? "").trim() || null,
      jobTitle: (r["What is your job title?"] ?? "").trim() || null,
    });
  }
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
  // Race: another writer beat us. Re-select.
  const [row] = await db
    .select({ id: tags.id })
    .from(tags)
    .where(inArray(tags.name, [name]))
    .limit(1);
  return row!.id;
}

async function main() {
  console.log("Importing NYC Tech Week 2025 RSVPs…\n");

  // 1. Parse all files. Collect per-email event participation.
  const byEmail = new Map<
    string,
    {
      data: ParsedRow;
      sourceSlug: string; // first event we saw them in
      eventTagIds: Set<string>;
    }
  >();

  const umbrellaTagId = await upsertTag(UMBRELLA_TAG.name, UMBRELLA_TAG.description);

  for (const f of FILES) {
    const tagId = await upsertTag(f.tagName, f.tagDescription);
    const rows = parseFile(f.path);
    console.log(`  ${f.path}: ${rows.length} valid rows`);
    for (const row of rows) {
      const existing = byEmail.get(row.email);
      if (existing) {
        existing.eventTagIds.add(tagId);
        // Backfill name/company if the later file has it and we didn't
        if (!existing.data.firstName && row.firstName)
          existing.data.firstName = row.firstName;
        if (!existing.data.lastName && row.lastName)
          existing.data.lastName = row.lastName;
        if (!existing.data.linkedin && row.linkedin)
          existing.data.linkedin = row.linkedin;
        if (!existing.data.company && row.company)
          existing.data.company = row.company;
        if (!existing.data.jobTitle && row.jobTitle)
          existing.data.jobTitle = row.jobTitle;
      } else {
        byEmail.set(row.email, {
          data: row,
          sourceSlug: f.sourceSlug,
          eventTagIds: new Set([tagId]),
        });
      }
    }
  }

  console.log(`\n  ${byEmail.size} unique emails across all files\n`);

  // 2. Filter suppression list.
  const allEmails = Array.from(byEmail.keys());
  const suppressed = await db
    .select({ email: suppressions.email })
    .from(suppressions)
    .where(inArray(suppressions.email, allEmails));
  const suppressedSet = new Set(suppressed.map((s) => s.email.toLowerCase()));
  if (suppressedSet.size > 0) {
    console.log(`  Skipping ${suppressedSet.size} suppressed addresses`);
    for (const e of suppressedSet) byEmail.delete(e);
  }

  // 3. Chunk-insert subscribers.
  const CHUNK = 500;
  const toInsert = Array.from(byEmail.values()).map((v) => ({
    email: v.data.email,
    firstName: v.data.firstName ?? null,
    lastName: v.data.lastName ?? null,
    source: v.sourceSlug,
    status: "active" as const,
    metadata: {
      linkedin: v.data.linkedin,
      company: v.data.company,
      jobTitle: v.data.jobTitle,
      importedFrom: "nyc-tech-week-2025-rsvp",
      importedAt: new Date().toISOString(),
    } as Record<string, unknown>,
  }));

  let inserted = 0;
  const insertedIdsByEmail = new Map<string, string>();
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const chunk = toInsert.slice(i, i + CHUNK);
    const result = await db
      .insert(subscribers)
      .values(chunk)
      .onConflictDoNothing()
      .returning({ id: subscribers.id, email: subscribers.email });
    inserted += result.length;
    for (const row of result) insertedIdsByEmail.set(row.email, row.id);
  }

  // 4. Some emails already existed → fetch their IDs so we can still attach tags.
  const allRequestedEmails = Array.from(byEmail.keys());
  const allRows = await db
    .select({ id: subscribers.id, email: subscribers.email })
    .from(subscribers)
    .where(inArray(subscribers.email, allRequestedEmails));
  for (const r of allRows) insertedIdsByEmail.set(r.email, r.id);

  // 5. Attach tags. Build (subscriberId, tagId) pairs idempotently.
  const tagPairs: { subscriberId: string; tagId: string }[] = [];
  for (const [email, v] of byEmail) {
    const subId = insertedIdsByEmail.get(email);
    if (!subId) continue;
    tagPairs.push({ subscriberId: subId, tagId: umbrellaTagId });
    for (const tagId of v.eventTagIds) {
      tagPairs.push({ subscriberId: subId, tagId });
    }
  }
  for (let i = 0; i < tagPairs.length; i += CHUNK) {
    const chunk = tagPairs.slice(i, i + CHUNK);
    await db.insert(subscriberTags).values(chunk).onConflictDoNothing();
  }

  console.log(`\n✓ Done.`);
  console.log(`  Subscribers inserted (new): ${inserted}`);
  console.log(`  Subscribers touched (total): ${insertedIdsByEmail.size}`);
  console.log(`  Tag attachments: ${tagPairs.length}`);
  console.log(`\n  Tags created/used:`);
  console.log(`    - ${UMBRELLA_TAG.name}`);
  for (const f of FILES) console.log(`    - ${f.tagName}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
