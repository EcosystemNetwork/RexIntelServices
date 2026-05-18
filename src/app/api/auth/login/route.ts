import { NextRequest, NextResponse } from "next/server";
import { createSession, verifyPassword } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const ip = clientIp(req);

  // Per-IP ceiling first — script-driven credential stuffing without IP
  // rotation hits this in seconds. 5 attempts per 15min matches industry
  // norms and is generous for an admin who fat-fingers their own password.
  const ipLimit = await rateLimit(`admin-login-ip:${ip}`, 5, 15 * 60 * 1000);
  if (!ipLimit.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(ipLimit.retryAfterSec) },
      },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    email?: string;
    password?: string;
  } | null;
  const email = body?.email?.trim().toLowerCase();
  const password = body?.password;
  if (!email || !password) {
    return NextResponse.json(
      { error: "email and password required" },
      { status: 400 },
    );
  }

  // Per-email ceiling — defends a single admin email against a botnet that
  // rotates IPs faster than the IP limit can keep up.
  const emailLimit = await rateLimit(
    `admin-login-email:${email}`,
    5,
    15 * 60 * 1000,
  );
  if (!emailLimit.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(emailLimit.retryAfterSec) },
      },
    );
  }

  const user = await verifyPassword(email, password);
  if (!user) {
    return NextResponse.json(
      { error: "invalid credentials" },
      { status: 401 },
    );
  }

  await createSession({ userId: user.id, email: user.email });
  return NextResponse.json({ ok: true });
}
