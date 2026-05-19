import { eq } from "drizzle-orm";
import { db, intelAddresses } from "@/lib/db";
import type { IntelPayload } from "@/lib/db/schema";

/**
 * Editorial-bar guard for intel approval.
 *
 * Every approved intel must carry SOME form of evidence. Six accepted forms:
 *   1. sources[]     — published sources (post links, news URLs)
 *   2. links[]       — referenced links (explorers, docs, threads)
 *   3. archiveUrl    — link-rot snapshot (archive.org / archive.today)
 *   4. media[]       — attached media (DM screenshots, contract verifications)
 *   5. linked addresses — on-chain proof in intel_addresses
 *   6. heroVideoUrl  — embedded video evidence (interview, breakdown)
 *
 * Body prose alone doesn't count — without external anchor or on-chain
 * evidence, a piece is hearsay no matter how well-written. Curators who
 * legitimately need to publish anonymous-source-only intel can pass
 * `bypass: true` (typically with a notes line explaining the offline
 * evidence kept out of public copy).
 *
 * The check runs on the pending → approved transition only. Previously
 * approved intel is grandfathered in — the floor applies to the future.
 */
export async function checkIntelEvidence(args: {
  submissionId: string;
  payload: IntelPayload;
  bypass?: boolean;
}): Promise<
  | { ok: true; reason: "bypass" | "evidence" }
  | { ok: false; reason: "no-evidence" }
> {
  if (args.bypass) return { ok: true, reason: "bypass" };

  const p = args.payload;
  if (p.sources && p.sources.length > 0) return { ok: true, reason: "evidence" };
  if (p.links && p.links.length > 0) return { ok: true, reason: "evidence" };
  if (p.archiveUrl) return { ok: true, reason: "evidence" };
  if (p.media && p.media.length > 0) return { ok: true, reason: "evidence" };
  if (p.heroVideoUrl) return { ok: true, reason: "evidence" };

  // On-chain evidence: any structurally-linked address counts. This is
  // checked AFTER the in-payload signals because it requires a DB hit.
  const [linkedRow] = await db
    .select({ submissionId: intelAddresses.submissionId })
    .from(intelAddresses)
    .where(eq(intelAddresses.submissionId, args.submissionId))
    .limit(1);
  if (linkedRow) return { ok: true, reason: "evidence" };

  return { ok: false, reason: "no-evidence" };
}

export const NO_EVIDENCE_ERROR_MESSAGE =
  "Intel must carry evidence before approval — add ≥1 source URL, link, archive snapshot, media item, linked address, or pass bypassEvidenceCheck=true with a reason in notes.";
