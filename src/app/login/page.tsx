import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { PublicShell } from "@/components/public-shell";
import { getSession, isOperatorEmail } from "@/lib/auth";
import { getMagicSession } from "@/lib/magic-auth";
import { db, submitters } from "@/lib/db";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

// Detect the two short-circuits that skip the OTP modal:
//   1. Operator session present → straight to /dashboard.
//   2. Community Magic session present + email is on the operator
//      allowlist → hand off to the auto-upgrade Route Handler, which
//      mints the operator session and redirects to /dashboard. Cookie
//      mutation has to live in a Route Handler — Next.js 14 forbids
//      cookies().set() from Server Component renders.
//
// `?upgrade=skip` on the inbound URL is the loopback signal from the
// auto-upgrade route when it decided not to mint (no magic session, or
// email not allowlisted). Honour it to avoid a redirect cycle.
async function tryAutoUpgrade(searchParams: {
  upgrade?: string;
}): Promise<void> {
  if (await getSession()) redirect("/dashboard");
  if (searchParams.upgrade === "skip") return;

  const magic = await getMagicSession();
  if (!magic) return;

  const [row] = await db
    .select({ email: submitters.email })
    .from(submitters)
    .where(eq(submitters.id, magic.submitterId))
    .limit(1);
  const email = row?.email;
  if (!email || !isOperatorEmail(email)) return;

  redirect("/api/auth/operator/auto-upgrade");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { upgrade?: string };
}) {
  await tryAutoUpgrade(searchParams);

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
