import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db, submissions } from "@/lib/db";
import type { SubmissionPayload } from "@/lib/db/schema";
import type { SubmissionType } from "@/lib/submission-validators";

export type DuplicateHit = {
  publicId: string;
  title: string;
  reason: "url" | "title";
  similarity: number;
};

const TITLE_SIMILARITY_THRESHOLD = 0.85;
const LOOKBACK_DAYS = 120;
const MAX_CANDIDATES = 300;

export async function detectPotentialDuplicate(args: {
  type: SubmissionType;
  payload: SubmissionPayload;
}): Promise<DuplicateHit | null> {
  const { type, payload } = args;
  const incomingTitle = primaryTitle(type, payload);
  const incomingUrl = normalizeUrl(primaryUrl(type, payload));
  if (!incomingTitle && !incomingUrl) return null;

  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      publicId: submissions.publicId,
      payload: submissions.payload,
    })
    .from(submissions)
    .where(
      and(
        eq(submissions.type, type),
        inArray(submissions.status, ["approved", "pending"]),
        gte(submissions.createdAt, since),
      ),
    )
    .orderBy(sql`${submissions.createdAt} DESC`)
    .limit(MAX_CANDIDATES);

  for (const row of rows) {
    const existing = row.payload as SubmissionPayload;
    const existingUrl = normalizeUrl(primaryUrl(type, existing));
    if (incomingUrl && existingUrl && incomingUrl === existingUrl) {
      return {
        publicId: row.publicId,
        title: primaryTitle(type, existing) ?? "(untitled)",
        reason: "url",
        similarity: 1,
      };
    }
  }

  if (incomingTitle) {
    const incomingNorm = normalizeTitle(incomingTitle);
    let best: { hit: DuplicateHit; similarity: number } | null = null;
    for (const row of rows) {
      const existingTitle = primaryTitle(type, row.payload as SubmissionPayload);
      if (!existingTitle) continue;
      const sim = diceCoefficient(incomingNorm, normalizeTitle(existingTitle));
      if (sim >= TITLE_SIMILARITY_THRESHOLD && (!best || sim > best.similarity)) {
        best = {
          similarity: sim,
          hit: {
            publicId: row.publicId,
            title: existingTitle,
            reason: "title",
            similarity: sim,
          },
        };
      }
    }
    if (best) return best.hit;
  }

  return null;
}

function primaryTitle(
  type: SubmissionType,
  payload: SubmissionPayload,
): string | null {
  const p = payload as Record<string, unknown>;
  if (type === "intel") return (p.headline as string) ?? null;
  if (type === "job") return (p.title as string) ?? null;
  return (p.name as string) ?? null;
}

function primaryUrl(
  type: SubmissionType,
  payload: SubmissionPayload,
): string | null {
  const p = payload as Record<string, unknown>;
  if (type === "intel") {
    const sources = Array.isArray(p.sources) ? (p.sources as string[]) : [];
    const links = Array.isArray(p.links) ? (p.links as string[]) : [];
    return sources[0] ?? links[0] ?? null;
  }
  if (type === "event" || type === "popup_city" || type === "residency") {
    return (p.url as string) ?? (p.applyUrl as string) ?? null;
  }
  if (type === "job") {
    return (p.applyUrl as string) ?? (p.companyUrl as string) ?? null;
  }
  if (type === "capital") {
    return (p.pitchUrl as string) ?? (p.organizationUrl as string) ?? null;
  }
  if (type === "hackathon") {
    return (p.url as string) ?? (p.registrationUrl as string) ?? null;
  }
  return (p.applyUrl as string) ?? (p.organizationUrl as string) ?? null;
}

export function normalizeUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    let path = u.pathname.replace(/\/+$/, "");
    if (path === "") path = "/";
    return `${host}${path}`.toLowerCase();
  } catch {
    return null;
  }
}

function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Sørensen–Dice on character bigrams. Robust to word reorderings and small
// edits; intuitive scale (1.0 = identical, >0.85 = near-duplicate for short
// titles). No deps.
function diceCoefficient(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = (s: string) => {
    const out = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      out.set(g, (out.get(g) ?? 0) + 1);
    }
    return out;
  };
  const aGrams = bigrams(a);
  const bGrams = bigrams(b);
  let intersection = 0;
  for (const [g, count] of aGrams) {
    const bc = bGrams.get(g);
    if (bc) intersection += Math.min(count, bc);
  }
  const total =
    [...aGrams.values()].reduce((s, n) => s + n, 0) +
    [...bGrams.values()].reduce((s, n) => s + n, 0);
  return total === 0 ? 0 : (2 * intersection) / total;
}
