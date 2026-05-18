import { and, eq, isNull, or, sql, inArray } from "drizzle-orm";
import { db, submissions } from "@/lib/db";
import { fetchOgImage } from "@/lib/event-parser";
import type {
  AcceleratorPayload,
  CapitalPayload,
  EventPayload,
  FellowshipPayload,
  GrantPayload,
  HackathonPayload,
  JobPayload,
  PerksPayload,
  PopupCityPayload,
  ResidencyPayload,
  SubmissionPayload,
} from "@/lib/db/schema";

/**
 * Walk every approved program-lane row with an empty `payload.imageUrl`,
 * fetch the most relevant URL on the payload, scrape its og:image, and
 * write the result back. Idempotent — rows that already have an imageUrl
 * are excluded by the SQL filter, so reruns are no-ops for everything
 * that's already covered.
 *
 * Shared between the one-shot CLI script (scripts/backfill-program-images.ts)
 * and the cron route (/api/cron/backfill-program-images). The script uses
 * generous concurrency for an interactive run; the cron caps `limit` so a
 * single execution stays inside Vercel's 300s function ceiling.
 */
export type ProgramType =
  | "event"
  | "hackathon"
  | "accelerator"
  | "fellowship"
  | "grant"
  | "capital"
  | "residency"
  | "perks"
  | "popup_city"
  | "job";

export const PROGRAM_TYPES: readonly ProgramType[] = [
  "event",
  "hackathon",
  "accelerator",
  "fellowship",
  "grant",
  "capital",
  "residency",
  "perks",
  "popup_city",
  "job",
];

type SubmissionType =
  | "intel"
  | "event"
  | "job"
  | "grant"
  | "accelerator"
  | "popup_city"
  | "hackathon"
  | "capital"
  | "residency"
  | "perks"
  | "fellowship"
  | "loss_report";

/**
 * Per-type URL priority. The first non-empty URL wins. We prefer the URL
 * most likely to surface a hero image: registration page > main page >
 * org page.
 */
export function urlsForPayload(
  type: ProgramType,
  p: SubmissionPayload,
): string[] {
  const arr: (string | undefined)[] = [];
  switch (type) {
    case "event":
      arr.push((p as EventPayload).url);
      break;
    case "hackathon": {
      const h = p as HackathonPayload;
      arr.push(h.registrationUrl, h.url, h.organizationUrl);
      break;
    }
    case "popup_city": {
      const c = p as PopupCityPayload;
      arr.push(c.url, c.applyUrl, c.organizationUrl);
      break;
    }
    case "accelerator": {
      const a = p as AcceleratorPayload;
      arr.push(a.applyUrl, a.organizationUrl);
      break;
    }
    case "fellowship": {
      const f = p as FellowshipPayload;
      arr.push(f.applyUrl, f.organizationUrl);
      break;
    }
    case "grant": {
      const g = p as GrantPayload;
      arr.push(g.applyUrl, g.organizationUrl);
      break;
    }
    case "capital": {
      const c = p as CapitalPayload;
      arr.push(c.pitchUrl, c.organizationUrl);
      break;
    }
    case "residency": {
      const r = p as ResidencyPayload;
      arr.push(r.applyUrl, r.url, r.organizationUrl);
      break;
    }
    case "perks": {
      const k = p as PerksPayload;
      arr.push(k.applyUrl, k.organizationUrl);
      break;
    }
    case "job": {
      const j = p as JobPayload;
      arr.push(j.applyUrl, j.companyUrl);
      break;
    }
  }
  return arr.filter((u): u is string => !!u && u.trim().length > 0);
}

export type BackfillSummary = {
  considered: number;
  scraped: number;
  failed: number;
  skipped: number;
  durationMs: number;
  samples: { publicId: string; type: ProgramType; imageUrl: string }[];
};

export type BackfillOptions = {
  /** Cap rows in this run. Cron uses 80; script defaults to all. */
  limit?: number;
  /** Restrict to one program type. */
  onlyType?: ProgramType | null;
  /** Parallel fetches in-flight. Default 4. */
  concurrency?: number;
  /** Per-event hook for verbose logging. */
  log?: (line: string) => void;
};

export async function runProgramImageBackfill(
  opts: BackfillOptions = {},
): Promise<BackfillSummary> {
  const startedAt = Date.now();
  const concurrency = opts.concurrency ?? 4;
  const limit = opts.limit ?? 10_000;
  const log = opts.log ?? (() => {});

  const types: readonly ProgramType[] = opts.onlyType
    ? [opts.onlyType]
    : PROGRAM_TYPES;

  const rows = await db
    .select({
      id: submissions.id,
      publicId: submissions.publicId,
      type: submissions.type,
      payload: submissions.payload,
    })
    .from(submissions)
    .where(
      and(
        eq(submissions.status, "approved"),
        inArray(
          submissions.type,
          types as readonly SubmissionType[] as SubmissionType[],
        ),
        or(
          isNull(sql`${submissions.payload}->>'imageUrl'`),
          eq(sql<string>`${submissions.payload}->>'imageUrl'`, ""),
        ),
      ),
    )
    .limit(limit);

  log(`considering ${rows.length} program rows`);

  let scraped = 0;
  let skipped = 0;
  let failed = 0;
  const samples: BackfillSummary["samples"] = [];

  for (let i = 0; i < rows.length; i += concurrency) {
    const slice = rows.slice(i, i + concurrency);
    await Promise.all(
      slice.map(async (row) => {
        const payload = row.payload as SubmissionPayload;
        const candidates = urlsForPayload(
          row.type as ProgramType,
          payload,
        );
        if (candidates.length === 0) {
          skipped++;
          return;
        }

        let imageUrl: string | null = null;
        for (const u of candidates) {
          const r = await fetchOgImage(u);
          if (r.ok) {
            imageUrl = r.url;
            break;
          }
        }

        if (!imageUrl) {
          failed++;
          return;
        }

        await db
          .update(submissions)
          .set({
            payload: { ...payload, imageUrl } as SubmissionPayload,
            updatedAt: new Date(),
          })
          .where(eq(submissions.id, row.id));
        scraped++;
        if (samples.length < 20) {
          samples.push({
            publicId: row.publicId,
            type: row.type as ProgramType,
            imageUrl,
          });
        }
        log(`  ✓ ${row.type} ${row.publicId} ← ${imageUrl}`);
      }),
    );
  }

  return {
    considered: rows.length,
    scraped,
    failed,
    skipped,
    durationMs: Date.now() - startedAt,
    samples,
  };
}
