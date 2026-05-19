import "dotenv/config";
import { sql, eq, inArray } from "drizzle-orm";
import { db, subscribers, subscriberTags, tags } from "../src/lib/db";

async function main() {
  const [total] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(subscribers);
  const [active] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(subscribers)
    .where(eq(subscribers.status, "active"));
  const [unsub] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(subscribers)
    .where(eq(subscribers.status, "unsubscribed"));
  const [bounced] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(subscribers)
    .where(eq(subscribers.status, "bounced"));
  const [complained] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(subscribers)
    .where(eq(subscribers.status, "complained"));

  console.log("Total subscribers:        ", total.c);
  console.log("  active:                 ", active.c);
  console.log("  unsubscribed:           ", unsub.c);
  console.log("  bounced:                ", bounced.c);
  console.log("  complained:             ", complained.c);

  const bySource = await db
    .select({ source: subscribers.source, c: sql<number>`count(*)::int` })
    .from(subscribers)
    .groupBy(subscribers.source)
    .orderBy(sql`count(*) desc`);
  console.log("\nBy source:");
  for (const r of bySource)
    console.log("  ", String(r.c).padStart(5), r.source ?? "(null)");

  const eventTagNames = [
    "nyc-tech-week-2025",
    "nytw-2025-innovate-fintech-ai",
    "nytw-2025-happyhour-ai-bots",
    "nytw-2025-bridging-eras-wealth",
    "eth-nyc-2025",
    "eth-nyc-2025-moon-gang",
    "eth-denver-2025",
    "eth-denver-2025-nifty-bruh-rave",
  ];
  const eventTags = await db
    .select({ name: tags.name, c: sql<number>`count(*)::int` })
    .from(tags)
    .innerJoin(subscriberTags, eq(subscriberTags.tagId, tags.id))
    .where(inArray(tags.name, eventTagNames))
    .groupBy(tags.name)
    .orderBy(sql`count(*) desc`);
  console.log("\nBy event tag:");
  for (const r of eventTags)
    console.log("  ", String(r.c).padStart(5), r.name);

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
