import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, submissions } from "@/lib/db";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import {
  validateBySubmissionType,
  type SubmissionType,
} from "@/lib/submission-validators";

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
};

async function loadByToken(token: string) {
  if (!token || !/^[a-f0-9]{32}$/.test(token)) return null;
  const [row] = await db
    .select()
    .from(submissions)
    .where(eq(submissions.editToken, token))
    .limit(1);
  return row ?? null;
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

  let body: { payload?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const validation = validateBySubmissionType(
    row.type as SubmissionType,
    body.payload,
  );
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  // Keep eventStartsAt in sync if this is a time-anchored type and the
  // submitter changed the start date.
  const startsAt = (validation.payload as { startsAt?: string }).startsAt;
  const eventStartsAt =
    (row.type === "event" || row.type === "popup_city" || row.type === "hackathon") && startsAt
      ? new Date(startsAt)
      : row.eventStartsAt;

  const [updated] = await db
    .update(submissions)
    .set({
      payload: validation.payload,
      eventStartsAt,
      updatedAt: new Date(),
    })
    .where(eq(submissions.id, row.id))
    .returning({ id: submissions.id, publicId: submissions.publicId });

  return NextResponse.json({
    ok: true,
    publicId: updated?.publicId,
  });
}
