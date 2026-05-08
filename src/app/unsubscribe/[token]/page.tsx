import { eq } from "drizzle-orm";
import { db, subscribers, suppressions } from "@/lib/db";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

async function unsubscribeAction(token: string) {
  "use server";
  const [sub] = await db
    .select()
    .from(subscribers)
    .where(eq(subscribers.unsubscribeToken, token))
    .limit(1);

  if (!sub) return;

  if (sub.status !== "unsubscribed") {
    await db
      .update(subscribers)
      .set({
        status: "unsubscribed",
        unsubscribedAt: new Date(),
      })
      .where(eq(subscribers.id, sub.id));

    await db
      .insert(suppressions)
      .values({
        email: sub.email.toLowerCase(),
        reason: "unsubscribe_global",
      })
      .onConflictDoNothing();
  }

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
        <h1 className="text-2xl font-semibold mb-2">Link not valid</h1>
        <p className="text-neutral-600">
          This unsubscribe link wasn&apos;t recognized. It may have already been used.
        </p>
      </Centered>
    );
  }

  const done = searchParams.done === "1" || sub.status === "unsubscribed";

  if (done) {
    return (
      <Centered>
        <h1 className="text-2xl font-semibold mb-2">You&apos;re unsubscribed</h1>
        <p className="text-neutral-600 mb-1">{sub.email}</p>
        <p className="text-neutral-600">
          We won&apos;t send you any more emails. Thanks for being with us.
        </p>
      </Centered>
    );
  }

  return (
    <Centered>
      <h1 className="text-2xl font-semibold mb-2">Unsubscribe</h1>
      <p className="text-neutral-600 mb-6">
        Are you sure you want to stop receiving emails at{" "}
        <strong>{sub.email}</strong>?
      </p>
      <form action={unsubscribeAction.bind(null, params.token)}>
        <button
          type="submit"
          className="rounded bg-black px-6 py-2.5 text-white text-sm font-medium hover:bg-neutral-800"
        >
          Yes, unsubscribe me
        </button>
      </form>
    </Centered>
  );
}

// Handle the RFC 8058 one-click POST.
// Gmail and Yahoo send a POST to this URL when users click "Unsubscribe" in their UI.
export async function POST(
  _req: Request,
  { params }: { params: { token: string } },
) {
  await unsubscribeAction(params.token);
  return new Response(null, { status: 200 });
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-neutral-50">
      <div className="max-w-md w-full bg-white border border-neutral-200 rounded-lg p-8 text-center">
        {children}
      </div>
    </div>
  );
}
