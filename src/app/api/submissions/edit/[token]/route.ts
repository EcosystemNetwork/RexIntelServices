import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { eq } from "drizzle-orm";
import { db, submissions } from "@/lib/db";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import {
  validateBySubmissionType,
  type SubmissionType,
} from "@/lib/submission-validators";
import { SUBMISSIONS_TAG } from "@/lib/cache";
import { verifyTurnstileToken } from "@/lib/turnstile";

/**
 * Token-based edit endpoint for non-anonymous submitters who want to fix
 * typos / refresh details on their own submission. The token is generated
 * on insert (16 bytes hex) and emailed to them by /api/submit.
 *
 * Auth model: possession of the token IS the auth. Token is unguessable
 * (~10^38 keyspace) and submitted via URL — same model as unsubscribe
 * links. No session required.
 *
 * What can be changed: only the payload (and we re-run the same validators
 * /api/submit uses). Status / submission type / submitterEmail / IP are
 * not editable here — those need admin tools.
 *
 * What happens after edit: status stays as-is. An admin-approved entry
 * remains approved; a pending one stays pending. The reasoning: trusted-
 * tier auto-approved submissions are tied to a verified-domain URL the
 * submitter controls anyway, and forcing all edits back through manual
 * review would create unwanted friction. If abuse appears, this can be
 * tightened later.
 *
 * GET  /api/submissions/edit/[token]   → { submission } for form prefill
 * POST /api/submissions/edit/[token]   → updates payload
 */

const TYPE_GUARD: Record<string, true> = {
  intel: true,
  event: true,
  job: true,
  grant: true,
  accelerator: true,
  popup_city: true,
  hackathon: true,
  capital: true,
  residency: true,
  perks: true,
};

async function loadByToken(token: string) {
  if (!token || !/^[a-f0-9]{32}$/.test(token)) return null;
  const [row] = await db
    .select()
    .from(submissions)
    .where(eq(submissions.editToken, token))
    .limit(1);
  if (!row) return null;
  // Tokens with NULL expiry are pre-0017 legacy and never expire. Tokens
  // with a set expiry are rejected past that timestamp.
  if (row.editTokenExpiresAt && row.editTokenExpiresAt.getTime() < Date.now()) {
    return null;
  }
  return row;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } },
) {
  const row = await loadByToken(params.token);
  if (!row) {
    return NextResponse.json({ error: "Edit link not found or expired." }, { status: 404 });
  }
  // Strip server-only fields before handing to the client.
  return NextResponse.json({
    submission: {
      id: row.id,
      type: row.type,
      status: row.status,
      payload: row.payload,
      submitterHandle: row.submitterHandle,
      publicId: row.publicId,
      // Re-render the same edit URL so the form footer can show + copy it.
      editToken: row.editToken,
    },
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } },
) {
  // Tighter rate limit on writes than on reads — same IP shouldn't be
  // mass-editing.
  const ip = clientIp(req);
  const limit = await rateLimit(`edit:${ip}`, 20, 30 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many edits. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSec) },
      },
    );
  }

  const row = await loadByToken(params.token);
  if (!row) {
    return NextResponse.json({ error: "Edit link not found or expired." }, { status: 404 });
  }
  // Honeypot/spam rows aren't editable — they shouldn't be reachable via
  // email anyway, but defense in depth.
  if (row.status === "spam") {
    return NextResponse.json({ error: "This submission can't be edited." }, { status: 403 });
  }
  if (!TYPE_GUARD[row.type]) {
    return NextResponse.json({ error: "Unknown submission type." }, { status: 500 });
  }

  let body: { payload?: unknown; turnstileToken?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Possession of the 128-bit token is the primary gate; Turnstile adds a
  // human-in-the-loop check so a leaked token can't be scripted at the full
  // per-IP rate-limit ceiling. When Turnstile env vars aren't set the
  // verifier returns ok:true with skipped:true (local dev pass-through).
  const captcha = await verifyTurnstileToken(body.turnstileToken, ip);
  if (!captcha.ok) {
    return NextResponse.json({ error: captcha.error }, { status: 400 });
  }

  const validation = validateBySubmissionType(
    row.type as SubmissionType,
    body.payload,
  );
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  // Keep eventStartsAt / eventEndsAt in sync if this is a time-anchored type
  // and the submitter changed the dates. endsAt may be omitted, so respect
  // an explicit absence by clearing the column rather than keeping the old
  // value — otherwise a stale end timestamp would still bucket the row.
  const isTimeAnchored =
    row.type === "event" || row.type === "popup_city" || row.type === "hackathon";
  const startsAt = (validation.payload as { startsAt?: string }).startsAt;
  const endsAt = (validation.payload as { endsAt?: string }).endsAt;
  const eventStartsAt =
    isTimeAnchored && startsAt ? new Date(startsAt) : row.eventStartsAt;
  const eventEndsAt = isTimeAnchored
    ? endsAt
      ? new Date(endsAt)
      : null
    : row.eventEndsAt;

  // Demote an approved/featured row back to pending on edit so a curator
  // re-reviews. A leaked or archived edit link otherwise lets the holder
  // silently rewrite a published intel post — investigative-journalism
  // surfaces depend on a published article matching what was approved.
  // Honeypot/spam rows can't reach here; pending/needs_info rows stay
  // in their current state.
  const nextStatus =
    row.status === "approved" ? ("pending" as const) : row.status;

  const [updated] = await db
    .update(submissions)
    .set({
      payload: validation.payload,
      status: nextStatus,
      eventStartsAt,
      eventEndsAt,
      updatedAt: new Date(),
    })
    .where(eq(submissions.id, row.id))
    .returning({ id: submissions.id, publicId: submissions.publicId });

  // Revalidate the public listing if the edited row was previously visible
  // — even if we're demoting it back to pending, the public surface must
  // refresh so the now-pending row stops appearing.
  if (row.status === "approved") {
    revalidateTag(SUBMISSIONS_TAG);
  }

  return NextResponse.json({
    ok: true,
    publicId: updated?.publicId,
  });
}
