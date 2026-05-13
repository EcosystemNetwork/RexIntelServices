import { and, asc, eq, gte } from "drizzle-orm";
import { db, submissions } from "@/lib/db";
import type { EventPayload } from "@/lib/db/schema";
import { absoluteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * iCalendar feed (RFC 5545) of upcoming events. Lets analysts subscribe
 * to the Field Calendar in Google Calendar / Apple Calendar / Outlook —
 * a much higher-fidelity follow than refreshing the /events page weekly.
 *
 * Caps at 200 upcoming events. CRLF line endings per the spec. Folds
 * long lines because iCal parsers vary in how they handle long fields.
 */
export async function GET() {
  const now = new Date();
  const rows = await db
    .select({
      publicId: submissions.publicId,
      payload: submissions.payload,
      publishedAt: submissions.publishedAt,
      updatedAt: submissions.updatedAt,
    })
    .from(submissions)
    .where(
      and(
        eq(submissions.type, "event"),
        eq(submissions.status, "approved"),
        gte(submissions.eventStartsAt, now),
      ),
    )
    .orderBy(asc(submissions.eventStartsAt))
    .limit(200);

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Rex Intel Services//Field Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Rex Intel Field Calendar",
    "X-WR-CALDESC:Curated crypto events worth tracking",
  ];

  for (const r of rows) {
    const p = r.payload as EventPayload;
    const start = new Date(p.startsAt);
    // iCal events need an end. Fall back to +2h if the event has no
    // explicit endsAt — better than emitting a malformed VEVENT.
    const end = p.endsAt
      ? new Date(p.endsAt)
      : new Date(start.getTime() + 2 * 60 * 60 * 1000);
    const dtstamp = (r.updatedAt ?? r.publishedAt ?? new Date()).toISOString();
    const uid = `${r.publicId}@rexintelservices.com`;
    const location = [p.venue, p.city, p.country].filter(Boolean).join(", ");
    const summary = p.name;
    const description = [
      p.description,
      p.url ? `Event page: ${p.url}` : "",
      `Listing: ${absoluteUrl(`/events/${r.publicId}`)}`,
    ]
      .filter(Boolean)
      .join("\\n\\n");

    lines.push(
      "BEGIN:VEVENT",
      foldLine(`UID:${uid}`),
      foldLine(`DTSTAMP:${toIcalUtc(dtstamp)}`),
      foldLine(`DTSTART:${toIcalUtc(start.toISOString())}`),
      foldLine(`DTEND:${toIcalUtc(end.toISOString())}`),
      foldLine(`SUMMARY:${escapeIcal(summary)}`),
      foldLine(`DESCRIPTION:${escapeIcal(description)}`),
      location ? foldLine(`LOCATION:${escapeIcal(location)}`) : "",
      foldLine(`URL:${absoluteUrl(`/events/${r.publicId}`)}`),
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");

  return new Response(lines.filter(Boolean).join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "Content-Disposition": 'inline; filename="rex-intel-events.ics"',
    },
  });
}

function toIcalUtc(iso: string): string {
  // 2026-05-11T16:30:00.000Z → 20260511T163000Z
  return iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeIcal(s: string): string {
  // Per RFC 5545: backslash, comma, semicolon, newline must be escaped.
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function foldLine(line: string): string {
  // RFC 5545 line folding: lines > 75 octets are split, continuation
  // lines start with a single space. Keep it simple — many readers
  // tolerate unfolded long lines but the strict ones don't.
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let i = 0;
  while (i < line.length) {
    parts.push((i === 0 ? "" : " ") + line.slice(i, i + 75));
    i += 75;
  }
  return parts.join("\r\n");
}
