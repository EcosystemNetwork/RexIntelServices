/**
 * Run with: npx tsx scripts/seed-events-ethglobal.ts
 *
 * Seeds upcoming ETHGlobal-listed events (scraped from ethglobal.com/events
 * on 2026-05-10) into the Field Calendar as approved + published. Idempotent:
 * matched by payload->>'name' so re-running updates existing rows in place.
 *
 * Time handling: ETHGlobal lists dates only, no times. We pin starts to
 * 12:00 UTC of the start date and ends to 23:00 UTC of the end date — the
 * /events page only renders the calendar date, and 12:00 UTC keeps the
 * past/upcoming flip aligned with the actual day in most timezones.
 *
 * Skips the bare "ETHConf" listing since ETHConf 2026 is already seeded and
 * featured via scripts/seed-event-ethconf.ts.
 */
import "dotenv/config";
import { and, eq, sql } from "drizzle-orm";
import { db, submissions } from "../src/lib/db";
import type { EventPayload } from "../src/lib/db/schema";

type SeedInput = {
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD (same as startDate for single-day)
  city?: string;
  country?: string;
  url: string;
  description: string;
  eventType: EventPayload["eventType"];
};

const inputs: SeedInput[] = [
  {
    name: "ETHGlobal New York 2026",
    startDate: "2026-06-12",
    endDate: "2026-06-14",
    city: "New York City",
    country: "United States",
    url: "https://ethglobal.com/events/newyork2026",
    description: "ETHGlobal in-person hackathon in New York.",
    eventType: "hackathon",
  },
  {
    name: "ETHGlobal Lisbon 2026",
    startDate: "2026-07-24",
    endDate: "2026-07-26",
    city: "Lisbon",
    country: "Portugal",
    url: "https://ethglobal.com/events/lisbon2026",
    description: "ETHGlobal in-person hackathon in Lisbon.",
    eventType: "hackathon",
  },
  {
    name: "ETHGlobal Café Vancouver at And-Co",
    startDate: "2026-05-11",
    endDate: "2026-05-11",
    city: "Vancouver",
    country: "Canada",
    url: "https://lu.ma/event/evt-SLUpkJan7yaZfbJ",
    description: "ETHGlobal co-working day in Vancouver.",
    eventType: "meetup",
  },
  {
    name: "ETHGlobal Happy Hour Cluj with ETHCluj",
    startDate: "2026-05-13",
    endDate: "2026-05-13",
    city: "Cluj-Napoca",
    country: "Romania",
    url: "https://luma.com/ethglobal-hh-cluj?utm_source=ethglobal",
    description: "ETHGlobal community happy hour at ETHCluj.",
    eventType: "meetup",
  },
  {
    name: "ETHConf Happy Hour Vancouver",
    startDate: "2026-05-14",
    endDate: "2026-05-14",
    city: "Vancouver",
    country: "Canada",
    url: "https://lu.ma/event/evt-DYBMSOEP4djOlMm",
    description: "ETHConf-affiliated happy hour in Vancouver.",
    eventType: "meetup",
  },
  {
    name: "ETHConf Happy Hour Toronto with Tetra",
    startDate: "2026-05-21",
    endDate: "2026-05-21",
    city: "Toronto",
    country: "Canada",
    url: "https://lu.ma/event/evt-pj9f4Ih5ZZz54Cb",
    description: "ETHConf-affiliated happy hour in Toronto with Tetra.",
    eventType: "meetup",
  },
  {
    name: "ETHMilan 2026",
    startDate: "2026-05-21",
    endDate: "2026-05-22",
    city: "Milan",
    country: "Italy",
    url: "https://www.ethmilan.xyz/",
    description: "ETHMilan co-working week in Milan.",
    eventType: "meetup",
  },
  {
    name: "Global Pizza Party Austin",
    startDate: "2026-05-22",
    endDate: "2026-05-22",
    city: "Austin",
    country: "United States",
    url: "https://www.rsv.pizza/austin",
    description: "Global Pizza Party — Austin chapter.",
    eventType: "meetup",
  },
  {
    name: "Global Pizza Party Washington DC",
    startDate: "2026-05-22",
    endDate: "2026-05-22",
    city: "Washington, D.C.",
    country: "United States",
    url: "https://www.rsv.pizza/washingtondc",
    description: "Global Pizza Party — Washington DC chapter.",
    eventType: "meetup",
  },
  {
    name: "Global Pizza Party Philadelphia",
    startDate: "2026-05-22",
    endDate: "2026-05-22",
    city: "Philadelphia",
    country: "United States",
    url: "https://www.rsv.pizza/philadelphia",
    description: "Global Pizza Party — Philadelphia chapter.",
    eventType: "meetup",
  },
  {
    name: "Global Pizza Party Bratislava",
    startDate: "2026-05-22",
    endDate: "2026-05-22",
    city: "Bratislava",
    country: "Slovakia",
    url: "https://www.rsv.pizza/bratislava",
    description: "Global Pizza Party — Bratislava chapter.",
    eventType: "meetup",
  },
  {
    name: "Global Pizza Party Phoenix",
    startDate: "2026-05-22",
    endDate: "2026-05-22",
    city: "Phoenix",
    country: "United States",
    url: "https://www.rsv.pizza/phoenix",
    description: "Global Pizza Party — Phoenix chapter.",
    eventType: "meetup",
  },
  {
    name: "Global Pizza Party Chicago",
    startDate: "2026-05-22",
    endDate: "2026-05-22",
    city: "Chicago",
    country: "United States",
    url: "https://www.rsv.pizza/chicago",
    description: "Global Pizza Party — Chicago chapter.",
    eventType: "meetup",
  },
  {
    name: "Global Pizza Party Waterloo",
    startDate: "2026-05-22",
    endDate: "2026-05-22",
    city: "Waterloo",
    country: "Canada",
    url: "https://www.rsv.pizza/waterloo",
    description: "Global Pizza Party — Waterloo chapter.",
    eventType: "meetup",
  },
  {
    name: "Global Pizza Party NYC: Modern Finance Edition",
    startDate: "2026-05-22",
    endDate: "2026-05-22",
    city: "New York City",
    country: "United States",
    url: "https://www.rsv.pizza/newyorkcity",
    description: "Global Pizza Party NYC — Modern Finance edition.",
    eventType: "meetup",
  },
  {
    name: "Global Pizza Party Miami",
    startDate: "2026-05-22",
    endDate: "2026-05-22",
    city: "Miami",
    country: "United States",
    url: "https://www.rsv.pizza/miami",
    description: "Global Pizza Party — Miami chapter.",
    eventType: "meetup",
  },
  {
    name: "Global Pizza Party Atlantic City",
    startDate: "2026-05-22",
    endDate: "2026-05-22",
    city: "Atlantic City",
    country: "United States",
    url: "https://www.rsv.pizza/atlanticcity",
    description: "Global Pizza Party — Atlantic City chapter.",
    eventType: "meetup",
  },
  {
    name: "Global Pizza Party Boston",
    startDate: "2026-05-22",
    endDate: "2026-05-22",
    city: "Boston",
    country: "United States",
    url: "https://www.rsv.pizza/boston",
    description: "Global Pizza Party — Boston chapter.",
    eventType: "meetup",
  },
  {
    name: "Pragma Lisbon 2026",
    startDate: "2026-07-25",
    endDate: "2026-07-25",
    city: "Lisbon",
    country: "Portugal",
    url: "https://ethglobal.com/events/pragma-lisbon2026",
    description: "Pragma builder & leader summit in Lisbon.",
    eventType: "conference",
  },
  {
    name: "ETHOnline 2026",
    startDate: "2026-09-04",
    endDate: "2026-09-16",
    city: "Online",
    url: "https://ethglobal.com/events/ethonline2026",
    description: "ETHGlobal online async hackathon.",
    eventType: "hackathon",
  },
  {
    name: "ETHGlobal Tokyo 2026",
    startDate: "2026-09-25",
    endDate: "2026-09-27",
    city: "Tokyo",
    country: "Japan",
    url: "https://ethglobal.com/events/tokyo2026",
    description: "ETHGlobal in-person hackathon in Tokyo.",
    eventType: "hackathon",
  },
  {
    name: "Pragma Tokyo 2026",
    startDate: "2026-09-26",
    endDate: "2026-09-26",
    city: "Tokyo",
    country: "Japan",
    url: "https://ethglobal.com/events/pragma-tokyo2026",
    description: "Pragma builder & leader summit in Tokyo.",
    eventType: "conference",
  },
  {
    name: "Pragma Mumbai",
    startDate: "2026-11-05",
    endDate: "2026-11-05",
    city: "Mumbai",
    country: "India",
    url: "https://ethglobal.com/events/pragma-mumbai",
    description: "Pragma builder & leader summit in Mumbai.",
    eventType: "conference",
  },
  {
    name: "ETHGlobal Mumbai",
    startDate: "2026-11-06",
    endDate: "2026-11-08",
    city: "Mumbai",
    country: "India",
    url: "https://ethglobal.com/events/mumbai",
    description: "ETHGlobal in-person hackathon in Mumbai.",
    eventType: "hackathon",
  },
];

function toPayload(input: SeedInput): EventPayload {
  // 12:00 UTC start / 23:00 UTC end keeps the displayed calendar date stable
  // across timezones and gets the past/upcoming flip aligned with the day.
  const startsAt = `${input.startDate}T12:00:00Z`;
  const endsAt =
    input.endDate === input.startDate
      ? undefined
      : `${input.endDate}T23:00:00Z`;
  return {
    name: input.name,
    startsAt,
    endsAt,
    city: input.city,
    country: input.country,
    url: input.url,
    description: input.description,
    eventType: input.eventType,
  };
}

async function upsertEvent(input: SeedInput) {
  const payload = toPayload(input);
  const eventStartsAt = new Date(payload.startsAt);

  const existing = await db
    .select({ id: submissions.id, publicId: submissions.publicId })
    .from(submissions)
    .where(
      and(
        eq(submissions.type, "event"),
        sql`${submissions.payload}->>'name' = ${payload.name}`,
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    const [row] = await db
      .update(submissions)
      .set({
        payload,
        eventStartsAt,
        status: "approved",
        publishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(submissions.id, existing[0].id))
      .returning({ publicId: submissions.publicId });
    return { action: "updated" as const, publicId: row.publicId };
  }

  const [row] = await db
    .insert(submissions)
    .values({
      type: "event",
      status: "approved",
      payload,
      eventStartsAt,
      publishedAt: new Date(),
    })
    .returning({ publicId: submissions.publicId });
  return { action: "inserted" as const, publicId: row.publicId };
}

async function main() {
  let inserted = 0;
  let updated = 0;
  for (const input of inputs) {
    const r = await upsertEvent(input);
    if (r.action === "inserted") inserted++;
    else updated++;
    console.log(`  ${r.action.padEnd(8)} /events/${r.publicId}  ${input.name}`);
  }
  console.log(
    `\n✓ ${inputs.length} events processed (${inserted} new, ${updated} updated).`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
