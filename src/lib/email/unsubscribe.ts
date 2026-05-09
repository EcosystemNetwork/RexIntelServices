import { eq } from "drizzle-orm";
import { db, subscribers, suppressions } from "@/lib/db";

export async function processUnsubscribe(token: string): Promise<boolean> {
  const [sub] = await db
    .select()
    .from(subscribers)
    .where(eq(subscribers.unsubscribeToken, token))
    .limit(1);

  if (!sub) return false;

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

  return true;
}
