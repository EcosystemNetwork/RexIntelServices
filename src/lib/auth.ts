import { cookies } from "next/headers";
import { sealData, unsealData } from "iron-session";
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { db, users } from "./db";

// =====================================================================
// Operator (admin) authentication. Email-only sign-in via Magic Link —
// the password rail was removed 2026-05-18. We still mint an iron-
// session cookie (`newsletter_session`) keyed on a real `users.id` so
// the existing middleware and the many admin routes that write
// `session.userId` into FK columns (reviewedBy, awardedByUserId, etc.)
// keep working untouched.
//
// Flow:
//   1. Client opens Magic OTP modal via /login → DID token returned.
//   2. POST { didToken } → /api/auth/operator/magic-login.
//   3. Route validates the DID via Magic Admin SDK (in lib/magic-auth),
//      checks the verified email against `isOperatorEmail()`, finds-or-
//      creates the `users` row, and calls `createSession()` here.
//
// Allowlist is env-driven: `OPERATOR_EMAILS` (comma-separated). When
// unset, only `rexintelservices@proton.me` is admitted — same email registered
// by `scripts/create-admin.ts`. Add a teammate by appending to the env
// var; no DB write required for the allowlist itself.
// =====================================================================

const SESSION_COOKIE = "newsletter_session";
const DEFAULT_OPERATOR_EMAIL = "rexintelservices@proton.me";

interface SessionData {
  userId: string;
  email: string;
}

function getPassword(): string {
  const pw = process.env.SESSION_PASSWORD;
  if (!pw || pw.length < 32) {
    throw new Error(
      "SESSION_PASSWORD must be at least 32 characters - generate one with `openssl rand -base64 32`",
    );
  }
  return pw;
}

export async function createSession(data: SessionData) {
  const sealed = await sealData(data, { password: getPassword() });
  cookies().set(SESSION_COOKIE, sealed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
}

export async function destroySession() {
  cookies().delete(SESSION_COOKIE);
}

export async function getSession(): Promise<SessionData | null> {
  const cookie = cookies().get(SESSION_COOKIE)?.value;
  if (!cookie) return null;
  try {
    // iron-session's `unsealData` returns `{}` (not throw) on garbage
    // input — a missing shape check would let any browser cookie value
    // satisfy `if (session)` callers. Verify the unsealed payload
    // carries the (userId, email) tuple we always seal in createSession.
    const payload = await unsealData<Partial<SessionData>>(cookie, {
      password: getPassword(),
    });
    if (
      typeof payload?.userId !== "string" ||
      payload.userId.length === 0 ||
      typeof payload?.email !== "string" ||
      payload.email.length === 0
    ) {
      return null;
    }
    return { userId: payload.userId, email: payload.email };
  } catch {
    return null;
  }
}

/**
 * Allowlist of operator emails — only these addresses can authenticate
 * against the admin portal. Sourced from `OPERATOR_EMAILS` (comma-
 * separated). When unset, defaults to `rexintelservices@proton.me`.
 *
 * Comparison is case-insensitive; whitespace is trimmed.
 */
export function operatorEmails(): string[] {
  const raw = process.env.OPERATOR_EMAILS;
  const list = raw
    ? raw
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    : [DEFAULT_OPERATOR_EMAIL];
  return list;
}

export function isOperatorEmail(email: string): boolean {
  const lower = email.trim().toLowerCase();
  return operatorEmails().includes(lower);
}

/**
 * Find-or-create a `users` row for an allowlisted operator email. The
 * row is the FK target for many admin tables (reviewedBy, awardedBy,
 * settledBy, ...). The `passwordHash` column is still NOT NULL in the
 * schema, so new operator rows get an unusable placeholder — password
 * login is no longer wired up, so this hash will never be compared.
 *
 * Caller MUST have already verified the email via Magic DID token.
 * The allowlist check is re-asserted here as defense-in-depth so a
 * future caller that forgets the precondition cannot silently
 * provision an operator row.
 */
export async function findOrCreateOperatorUser(
  email: string,
): Promise<{ id: string; email: string }> {
  const lower = email.trim().toLowerCase();
  if (!isOperatorEmail(lower)) {
    throw new Error(
      `findOrCreateOperatorUser: refusing to provision non-allowlisted email ${lower}`,
    );
  }
  const [existing] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(sql`lower(${users.email}) = ${lower}`)
    .limit(1);
  if (existing) return existing;

  // Unusable placeholder — bcrypt hash of a 32-char random string that
  // is never stored anywhere. Password verification is gone, but the
  // schema still requires the column.
  const placeholder = await bcrypt.hash(
    `unusable-${crypto.randomUUID()}-${Date.now()}`,
    10,
  );

  const [inserted] = await db
    .insert(users)
    .values({ email: lower, passwordHash: placeholder })
    .onConflictDoUpdate({
      target: users.email,
      set: { email: lower },
    })
    .returning({ id: users.id, email: users.email });
  return inserted;
}
