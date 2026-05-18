import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { eq } from "drizzle-orm";
import { db, campaigns } from "@/lib/db";
import { requireOperator } from "@/lib/auth";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let _resend: Resend | null = null;
function getResend(): Resend {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set");
  _resend = new Resend(key);
  return _resend;
}

/**
 * POST /api/campaigns/[id]/test-send
 * Body: { to: "addr@x.com" | string[]  (max 5) }
 *
 * Renders the campaign with placeholder merge tags and sends a one-off email.
 * Does NOT touch the campaign status, the sends table, or the suppression list,
 * so it's safe to fire repeatedly while iterating on copy. Open/click tracking
 * is intentionally skipped — these previews shouldn't pollute analytics.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireOperator(req);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const raw = body.to;
  const recipients: string[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const cleaned = recipients
    .map((r) => String(r).trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 5);
  if (cleaned.length === 0) {
    return NextResponse.json({ error: "to required" }, { status: 400 });
  }
  for (const e of cleaned) {
    if (!EMAIL_REGEX.test(e)) {
      return NextResponse.json(
        { error: `invalid email: ${e}` },
        { status: 400 },
      );
    }
  }

  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, params.id))
    .limit(1);
  if (!campaign) {
    return NextResponse.json({ error: "campaign not found" }, { status: 404 });
  }

  const previewSubject = applyTags(campaign.subject, body.previewName);
  const previewHtml =
    `<div style="background:#fef3c7;color:#78350f;padding:12px 16px;font-family:system-ui;font-size:13px;border-bottom:1px solid #fbbf24;">
      <strong>TEST SEND</strong> — campaign "${escapeHtml(campaign.name)}". Tracking disabled.
    </div>` + applyTags(campaign.htmlBody, body.previewName);

  try {
    const result = await getResend().emails.send({
      from: `${campaign.fromName} <${campaign.fromEmail}>`,
      to: cleaned,
      subject: `[TEST] ${previewSubject}`,
      html: previewHtml,
      replyTo: campaign.replyTo ?? undefined,
    });
    if (result.error) {
      return NextResponse.json(
        { error: result.error.message ?? "send failed" },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true, sentTo: cleaned, id: result.data?.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function applyTags(s: string, previewName?: string): string {
  const name = (previewName ?? "Alex").toString().slice(0, 64);
  return s
    .replace(/\{\{\s*firstName\s*\}\}/g, name)
    .replace(/\{\{\s*lastName\s*\}\}/g, "")
    .replace(/\{\{\s*email\s*\}\}/g, "test@example.com");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
