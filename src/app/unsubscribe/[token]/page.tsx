import { eq } from "drizzle-orm";
import { db, subscribers } from "@/lib/db";
import { redirect } from "next/navigation";
import { processUnsubscribe } from "@/lib/email/unsubscribe";

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
      <Centered>
        <h1 className="text-2xl font-semibold mb-2 text-white">
          Link not valid
        </h1>
        <p style={{ color: "var(--rex-text-muted)" }}>
          This unsubscribe link wasn&apos;t recognized. It may have already been
          used.
        </p>
      </Centered>
    );
  }

  const done = searchParams.done === "1" || sub.status === "unsubscribed";

  if (done) {
    return (
      <Centered>
        <h1 className="text-2xl font-semibold mb-2 text-white">
          You&apos;re unsubscribed
        </h1>
        <p className="mb-1" style={{ color: "var(--rex-text-muted)" }}>
          {sub.email}
        </p>
        <p style={{ color: "var(--rex-text-muted)" }}>
          We won&apos;t send you any more emails. Thanks for being with us.
        </p>
      </Centered>
    );
  }

  return (
    <Centered>
      <h1 className="text-2xl font-semibold mb-2 text-white">Unsubscribe</h1>
      <p className="mb-6" style={{ color: "var(--rex-text-muted)" }}>
        Are you sure you want to stop receiving emails at{" "}
        <strong className="text-white">{sub.email}</strong>?
      </p>
      <form action={unsubscribeAction.bind(null, params.token)}>
        <button type="submit" className="rex-btn" id="unsubscribe-confirm">
          Yes, unsubscribe me
        </button>
      </form>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "var(--rex-bg)" }}
    >
      <div className="rex-modal text-center">{children}</div>
    </div>
  );
}
