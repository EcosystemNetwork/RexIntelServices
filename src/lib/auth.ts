import { cookies } from "next/headers";
import { sealData, unsealData } from "iron-session";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, users } from "./db";

const SESSION_COOKIE = "newsletter_session";

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
    return await unsealData<SessionData>(cookie, { password: getPassword() });
  } catch {
    return null;
  }
}

export async function verifyPassword(
  email: string,
  password: string,
): Promise<{ id: string; email: string } | null> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;
  return { id: user.id, email: user.email };
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}
