import { NextRequest, NextResponse } from "next/server";
import { createSession, verifyPassword } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  if (!email || !password) {
    return NextResponse.json(
      { error: "email and password required" },
      { status: 400 },
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
