import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { verifyCronSecret } from "@/lib/cron-auth";

// GET /api/diag/otp-health
// Auth: `Authorization: Bearer ${CRON_SECRET}` — reuses the cron-secret gate
// so we don't need a separate diag token.
//
// Why this exists: /api/auth/email/request-otp is designed to always return
// 200 (anti-enumeration), which means a production-only failure can be
// invisible. This endpoint reports the three things that most plausibly
// break the OTP path in prod — without leaking the secret values themselves.
//
// Returns:
//   { ok, checks: [{ name, ok, detail }] }
// `ok` is the AND of every check. `detail` is a non-secret descriptor
// (presence, length, error class) — never the secret itself.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Check = { name: string; ok: boolean; detail: string };

export async function GET(req: NextRequest) {
  const fail = verifyCronSecret(req);
  if (fail) return NextResponse.json(fail.body, { status: fail.status });

  const checks: Check[] = [];

  const sp = process.env.SESSION_PASSWORD;
  checks.push({
    name: "SESSION_PASSWORD",
    ok: !!sp && sp.length >= 32,
    detail: !sp
      ? "missing"
      : sp.length < 32
        ? `present but ${sp.length} chars (need ≥32)`
        : `present (${sp.length} chars)`,
  });

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    checks.push({ name: "DATABASE_URL", ok: false, detail: "missing" });
  } else {
    try {
      await db.execute(sql`select 1`);
      checks.push({ name: "DATABASE_URL", ok: true, detail: "select 1 ok" });
    } catch (e) {
      checks.push({
        name: "DATABASE_URL",
        ok: false,
        detail: `connect failed: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  // Table existence check — covers the "migration 0025 not applied" failure
  // mode. to_regclass returns NULL for a missing table without throwing,
  // which is what we want.
  try {
    const r = await db.execute(
      sql`select to_regclass('public.email_verifications') as r`,
    );
    const row = (r as unknown as { rows?: Array<{ r: string | null }> }).rows?.[0] ?? null;
    const exists = !!row?.r;
    checks.push({
      name: "email_verifications table",
      ok: exists,
      detail: exists ? "exists" : "missing (apply migration 0025)",
    });
  } catch (e) {
    checks.push({
      name: "email_verifications table",
      ok: false,
      detail: `probe failed: ${e instanceof Error ? e.message : String(e)}`,
    });
  }

  checks.push({
    name: "RESEND_API_KEY",
    ok: !!process.env.RESEND_API_KEY,
    detail: process.env.RESEND_API_KEY ? "present" : "missing",
  });
  checks.push({
    name: "DIGEST_FROM_EMAIL",
    ok: !!process.env.DIGEST_FROM_EMAIL,
    detail: process.env.DIGEST_FROM_EMAIL ? "present" : "missing",
  });

  const ok = checks.every((c) => c.ok);
  return NextResponse.json({ ok, checks });
}
