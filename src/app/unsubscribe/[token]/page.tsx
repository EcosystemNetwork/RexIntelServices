import { eq } from "drizzle-orm";
import { db, subscribers } from "@/lib/db";
import { redirect } from "next/navigation";
import { processUnsubscribe } from "@/lib/email/unsubscribe";
import { PublicShell } from "@/components/public-shell";

export const dynamic = "force-dynamic";

async function unsubscribeAction(token: string) {
  "use server";
  await processUnsubscribe(token);
  redirect(`/unsubscribe/${token}?done=1`);
}

export default async function UnsubscribePage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { done?: string };
}) {
  const [sub] = await db
    .select()
    .from(subscribers)
    .where(eq(subscribers.unsubscribeToken, params.token))
    .limit(1);

  if (!sub) {
    return (
      <Shell heading="● Closed Channel // Link Invalid">
        <h1 className="font-display text-2xl font-semibold mb-2 text-[var(--rex-text)]">
          Link not valid
        </h1>
        <p style={{ color: "var(--rex-text-muted)" }}>
          This unsubscribe link wasn&apos;t recognized. It may have already been
          used.
        </p>
      </Shell>
    );
  }

  const done = searchParams.done === "1" || sub.status === "unsubscribed";

  if (done) {
    return (
      <Shell heading="● Channel Closed // Unsubscribed">
        <h1 className="font-display text-2xl font-semibold mb-2 text-[var(--rex-text)]">
          You&apos;re unsubscribed
        </h1>
        <p className="mb-1" style={{ color: "var(--rex-text-muted)" }}>
          {sub.email}
        </p>
        <p style={{ color: "var(--rex-text-muted)" }}>
          We won&apos;t send you any more emails. Thanks for being with us.
        </p>
      </Shell>
    );
  }

  return (
    <Shell heading="● Open Channel // Confirm Unsubscribe">
      <h1 className="font-display text-2xl font-semibold mb-2 text-[var(--rex-text)]">
        Unsubscribe
      </h1>
      <p className="mb-6" style={{ color: "var(--rex-text-muted)" }}>
        Are you sure you want to stop receiving emails at{" "}
        <strong className="text-[var(--rex-text)]">{sub.email}</strong>?
      </p>
      <form action={unsubscribeAction.bind(null, params.token)}>
        <button type="submit" className="rex-btn" id="unsubscribe-confirm">
          Yes, unsubscribe me
        </button>
      </form>
    </Shell>
  );
}

function Shell({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <PublicShell classification={[{ text: heading }]}>
      <main className="max-w-md mx-auto px-6 pt-12 md:pt-20 pb-24">
        <div className="rex-card p-8 text-center animate-fade-in">{children}</div>
      </main>
    </PublicShell>
  );
}
