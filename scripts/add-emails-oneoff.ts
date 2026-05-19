import "./_load-env";
import { eq, inArray } from "drizzle-orm";
import { db, subscribers, suppressions } from "../src/lib/db";

const EMAILS = [
  "kartik@ethglobal.com",
  "pascal@ethglobal.com",
  "yjkshan33@gmail.com",
].map((e) => e.trim().toLowerCase());

const SOURCE = "manual_add_ethglobal_2026_05_19";

async function main() {
  const blocked = await db
    .select({ email: suppressions.email })
    .from(suppressions)
    .where(inArray(suppressions.email, EMAILS));
  const blockedSet = new Set(blocked.map((r) => r.email));

  const existing = await db
    .select({
      id: subscribers.id,
      email: subscribers.email,
      status: subscribers.status,
    })
    .from(subscribers)
    .where(inArray(subscribers.email, EMAILS));
  const existingByEmail = new Map(existing.map((r) => [r.email, r]));

  for (const email of EMAILS) {
    if (blockedSet.has(email)) {
      console.log(`[skip-suppressed] ${email}`);
      continue;
    }

    const row = existingByEmail.get(email);
    if (!row) {
      await db.insert(subscribers).values({
        email,
        source: SOURCE,
        status: "active",
      });
      console.log(`[inserted]        ${email}`);
      continue;
    }

    if (row.status === "active") {
      console.log(`[already-active]  ${email}`);
      continue;
    }

    await db
      .update(subscribers)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(subscribers.id, row.id));
    console.log(`[reactivated]     ${email}  (was ${row.status})`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
