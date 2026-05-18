import { and, eq, ne, sql } from "drizzle-orm";
import {
  db,
  submissions,
  intelAddresses,
  addresses,
  type AddressRole,
  type LossReportPayload,
} from "./db";
import { upsertAttribution } from "./address-attribution";

/**
 * Loss-report attribution writer + reputation gate.
 *
 * On curator approval of a loss_report submission, this module decides whether
 * to write community-loss-report attribution rows immediately or queue them
 * for backfill once the submitter crosses the contributor threshold.
 *
 * Gate rules (intentionally simple — the goal is to keep low-rep submitters
 * from polluting the graph without making genuine victims feel ignored):
 *
 *   - Anonymous loss reports: no submitter row exists, no rep to gate on.
 *     Curator approval is the only check; if they approved it, the attribution
 *     writes immediately. (Curators bear the false-positive risk on these.)
 *
 *   - Non-anonymous, submitter has ≥1 prior non-loss-report approved
 *     submission: write immediately. The earlier contribution proves the
 *     submitter has a track record curators trust on independent grounds.
 *
 *   - Non-anonymous, submitter has only loss_report history (or none): queue.
 *     The submission row's graph_attribution_status is set to 'queued'. The
 *     attribution row is NOT written. As soon as the submitter earns an
 *     approved contribution on a different surface (tip, original, incident,
 *     event scoop, etc.), awardContributionPoints triggers backfill.
 *
 * Loss-reports earn points (+3) so victims aren't ignored, but those points
 * alone can't unlock their own graph write — the gate is a *separate*
 * non-loss-report approval. Closes the "five fake loss reports → instant
 * graph access" loop without making the points ledger ugly.
 */

const ROLE_TO_CATEGORY: Record<AddressRole, "lost" | "hack-destination" | null> = {
  // The victim's own address — the wallet that got drained. "lost" matches
  // the user's framing on /graph ("Reported lost crypto"). When toggled off,
  // this row is hidden because its primary source is community-loss-report.
  subject: "lost",
  // Where the funds went — drainer wallet, mixer deposit, exchange dep
  // address. "hack-destination" is the existing category for this concept,
  // though we tag it with the lowest-precedence source so a real hack-source
  // attribution from incident-derived sources still wins denorm.
  counterparty: "hack-destination",
  // No category — just provenance. Won't appear on /graph until something
  // higher-precedence attributes it.
  observed: null,
};

/**
 * Curator approval handler for loss_report submissions. Returns the state
 * the submission row should record. Idempotent — repeated calls write the
 * same upsert rows; the partial index handles dedupe.
 */
export async function processLossReportApproval(args: {
  submissionId: string;
  submitterId: string | null;
  payload: LossReportPayload;
}): Promise<"written" | "queued"> {
  // Anonymous submitters have no rep to gate on — the curator's approval IS
  // the only signal, so we write immediately.
  const shouldWrite =
    !args.submitterId ||
    (await hasNonLossReportApproval(args.submitterId, args.submissionId));

  if (!shouldWrite) {
    await db
      .update(submissions)
      .set({ graphAttributionStatus: "queued", updatedAt: new Date() })
      .where(eq(submissions.id, args.submissionId));
    return "queued";
  }

  await writeAttributionsForSubmission(args.submissionId, args.payload);
  await db
    .update(submissions)
    .set({ graphAttributionStatus: "written", updatedAt: new Date() })
    .where(eq(submissions.id, args.submissionId));
  return "written";
}

/**
 * Called from awardContributionPoints after any successful points award.
 * If the submitter now has at least one approved non-loss-report submission,
 * find every queued loss_report submission for them and write its pending
 * attribution rows. Cheap to call on every award — the gate query is a
 * partial-index hit and the queued-row query is also indexed.
 */
export async function runQueuedBackfillForSubmitter(
  submitterId: string,
): Promise<{ processed: number }> {
  const gateOk = await hasNonLossReportApproval(submitterId);
  if (!gateOk) return { processed: 0 };

  const rows = await db
    .select({ id: submissions.id, payload: submissions.payload })
    .from(submissions)
    .where(
      and(
        eq(submissions.submitterId, submitterId),
        eq(submissions.type, "loss_report"),
        eq(submissions.status, "approved"),
        eq(submissions.graphAttributionStatus, "queued"),
      ),
    );

  let processed = 0;
  for (const r of rows) {
    try {
      await writeAttributionsForSubmission(
        r.id,
        r.payload as LossReportPayload,
      );
      await db
        .update(submissions)
        .set({ graphAttributionStatus: "written", updatedAt: new Date() })
        .where(eq(submissions.id, r.id));
      processed += 1;
    } catch (err) {
      console.warn(
        `[loss-report-attribution] backfill failed for submission ${r.id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return { processed };
}

/**
 * True if the submitter has at least one approved submission whose type
 * is *not* loss_report. Optionally excludes a specific submission id —
 * used so a brand-new submitter whose only history is the loss_report
 * being currently reviewed isn't considered to have a track record.
 */
async function hasNonLossReportApproval(
  submitterId: string,
  excludeSubmissionId?: string,
): Promise<boolean> {
  const conditions = [
    eq(submissions.submitterId, submitterId),
    eq(submissions.status, "approved"),
    ne(submissions.type, "loss_report"),
  ];
  if (excludeSubmissionId) {
    conditions.push(ne(submissions.id, excludeSubmissionId));
  }
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(submissions)
    .where(and(...conditions))
    .limit(1);
  return (row?.n ?? 0) > 0;
}

async function writeAttributionsForSubmission(
  submissionId: string,
  payload: LossReportPayload,
) {
  // Read the addresses already linked to this submission via intel_addresses
  // (the /submit endpoint wrote them at intake time). Each row carries the
  // role chosen by the submitter — subject (their wallet), counterparty
  // (the drainer's), observed (otherwise mentioned).
  const links = await db
    .select({
      addressId: intelAddresses.addressId,
      role: intelAddresses.role,
      chain: addresses.chain,
      address: addresses.address,
      label: addresses.label,
    })
    .from(intelAddresses)
    .innerJoin(addresses, eq(intelAddresses.addressId, addresses.id))
    .where(eq(intelAddresses.submissionId, submissionId));

  const reportedAt = parseLossDate(payload.lossDate);
  const sourceRef = `loss-report:${submissionId}`;
  const labelFromHeadline = payload.headline.slice(0, 120);

  for (const link of links) {
    const category = ROLE_TO_CATEGORY[link.role];
    await upsertAttribution({
      chain: link.chain,
      address: link.address,
      source: "community-loss-report",
      sourceRef,
      // Confidence is intentionally low — this is a self-report, the curator
      // approved that the *story* is plausible, not that the attribution is
      // forensically verified.
      confidence: 30,
      category,
      label: link.label ?? labelFromHeadline,
      notes: payload.story.slice(0, 500),
      reportedAt,
    });
  }
}

function parseLossDate(raw: string | undefined): Date | null {
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? new Date(t) : null;
}
