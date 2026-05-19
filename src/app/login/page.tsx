import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { PublicShell } from "@/components/public-shell";
import {
  createSession,
  findOrCreateOperatorUser,
  getSession,
  isOperatorEmail,
} from "@/lib/auth";
import { getMagicSession } from "@/lib/magic-auth";
import { db, submitters } from "@/lib/db";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

// If the visitor already holds an operator session, jump straight to the
// dashboard. If they hold only a community Magic session and the email on
// that session is allowlisted, mint the operator session inline and skip
// the second OTP round-trip — the DID token was already validated when the
// community session was minted.
async function tryAutoUpgrade(): Promise<void> {
  const op = await getSession();
  if (op) redirect("/dashboard");

  const magic = await getMagicSession();
  if (!magic) return;

  const [row] = await db
    .select({ email: submitters.email })
    .from(submitters)
    .where(eq(submitters.id, magic.submitterId))
    .limit(1);
  const email = row?.email;
  if (!email || !isOperatorEmail(email)) return;

  const user = await findOrCreateOperatorUser(email);
  await createSession({ userId: user.id, email: user.email });
  redirect("/dashboard");
}

export default async function LoginPage() {
  await tryAutoUpgrade();

  return (
    <PublicShell
      classification={[
        { text: "● Restricted // Command Center" },
        { text: "Operator Authentication", show: "sm" },
      ]}
    >
      <main className="max-w-md mx-auto px-6 pt-12 md:pt-20 pb-24">
        <div className="rex-card p-8 animate-fade-in">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-[var(--rex-text)] mb-1">
            Welcome back
          </h1>
          <p className="text-sm mb-6" style={{ color: "var(--rex-text-muted)" }}>
            Sign in with your operator email. We&apos;ll send a one-time code.
          </p>

          <LoginForm />

          <p
            className="mt-4 text-[11px]"
            style={{ color: "var(--rex-text-dim)" }}
          >
            Magic-Link OTP · no password to remember, no seed phrase.
          </p>
        </div>
      </main>
    </PublicShell>
  );
}
