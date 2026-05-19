/**
 * One-shot importer for ETH Denver 2025 — NIFTY BRUH: RAVE For World Peace
 * side event Luma CSV.
 *
 * Source: /tmp/eth-denver-2025-rave.csv (Luma "Guests" export, 2026-05-19).
 * Imports every approved or invited guest as an active subscriber:
 *   - approval_status="approved" | "invited"  → imported
 *   - approval_status="declined"              → skipped
 *   - source = event-eth-denver-2025-nifty-bruh-rave
 *   - tags   = umbrella `eth-denver-2025` + per-event `eth-denver-2025-nifty-bruh-rave`
 *   - metadata preserves approvalStatus, checkedInAt, eth/sol wallets,
 *     rune address, instagram, linkedin, ticketName, amount, couponCode.
 *
 * Run:  npx tsx --env-file=.env scripts/import-eth-denver-2025-rave.ts
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

const CSV_PATH = "/tmp/eth-denver-2025-rave.csv";
const SOURCE_SLUG = "event-eth-denver-2025-nifty-bruh-rave";

const EVENT_TAG = {
  name: "eth-denver-2025-nifty-bruh-rave",
  description:
    "ETH Denver 2025 — NIFTY BRUH: RAVE For World Peace side event guest list (Feb–Mar 2025)",
};
const UMBRELLA_TAG = {
  name: "eth-denver-2025",
  description: "All ETH Denver 2025 side event RSVPs",
};

interface ParsedRow {
  email: string;
  firstName: string | null;
  lastName: string | null;
  approvalStatus: string;
  checkedInAt: string | null;
  ethAddress: string | null;
  solanaAddress: string | null;
  runeAddress: string | null;
  instagram: string | null;
  linkedin: string | null;
  ticketName: string | null;
  amount: string | null;
  couponCode: string | null;
}

function parseFile(path: string): ParsedRow[] {
  const text = readFileSync(path, "utf8");
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    // Strip BOM from first header.
    transformHeader: (h) => h.trim().replace(/^﻿/, ""),
  });
  const rows: ParsedRow[] = [];
  let skippedDeclined = 0;
  let skippedNoEmail = 0;
  let skippedInvalidEmail = 0;
  for (const r of parsed.data) {
    const email = (r.email ?? "").trim().toLowerCase();
    if (!email) {
      skippedNoEmail++;
      continue;
    }
    if (!EMAIL_REGEX.test(email)) {
      skippedInvalidEmail++;
      continue;
    }
    const approvalStatus = (r.approval_status ?? "").trim().toLowerCase();
    if (approvalStatus !== "approved" && approvalStatus !== "invited") {
      skippedDeclined++;
      continue;
    }
    const firstName = (r.first_name ?? "").trim() || null;
    const lastName = (r.last_name ?? "").trim() || null;
    let resolvedFirst = firstName;
    let resolvedLast = lastName;
    if (!resolvedFirst && !resolvedLast) {
      const nameFallback = (r.name ?? "").trim();
      if (nameFallback) resolvedFirst = nameFallback;
    }
    rows.push({
      email,
      firstName: resolvedFirst,
      lastName: resolvedLast,
      approvalStatus,
      checkedInAt: (r.checked_in_at ?? "").trim() || null,
      ethAddress: (r.eth_address ?? "").trim() || null,
      solanaAddress: (r.solana_address ?? "").trim() || null,
      runeAddress:
        (r["Bitcoin Rune Address For Airdrop"] ?? "").trim() || null,
      instagram:
        (r["What is your Instagram username?"] ?? "").trim() || null,
      linkedin:
        (r["What is your LinkedIn profile?"] ?? "").trim() || null,
      ticketName: (r.ticket_name ?? "").trim() || null,
      amount: (r.amount ?? "").trim() || null,
      couponCode: (r.coupon_code ?? "").trim() || null,
    });
  }
  console.log(
    `  parsed ${rows.length} keeper rows ` +
      `(skipped ${skippedDeclined} declined, ${skippedNoEmail} no-email, ${skippedInvalidEmail} invalid-email)`,
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
  console.log("Importing ETH Denver 2025 — NIFTY BRUH RAVE guest list…\n");

  const eventTagId = await upsertTag(EVENT_TAG.name, EVENT_TAG.description);
  const umbrellaTagId = await upsertTag(
    UMBRELLA_TAG.name,
    UMBRELLA_TAG.description,
  );

  const rows = parseFile(CSV_PATH);

  // Dedupe by email.
  const byEmail = new Map<string, ParsedRow>();
  for (const r of rows) {
    const existing = byEmail.get(r.email);
    if (!existing) {
      byEmail.set(r.email, r);
      continue;
    }
    if (
      existing.approvalStatus === "invited" &&
      r.approvalStatus === "approved"
    ) {
      byEmail.set(r.email, r);
    }
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
      approvalStatus: v.approvalStatus,
      checkedInAt: v.checkedInAt,
      ethAddress: v.ethAddress,
      solanaAddress: v.solanaAddress,
      runeAddress: v.runeAddress,
      instagram: v.instagram,
      linkedin: v.linkedin,
      ticketName: v.ticketName,
      amount: v.amount,
      couponCode: v.couponCode,
      importedFrom: "eth-denver-2025-nifty-bruh-rave-luma",
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
