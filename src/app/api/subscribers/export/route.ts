import { NextRequest, NextResponse } from "next/server";
import { desc, eq, ilike, or, sql, and } from "drizzle-orm";
import { db, subscribers } from "@/lib/db";
import { requireOperator } from "@/lib/auth";

/**
 * GET /api/subscribers/export?status=active&q=foo
 * Returns a CSV download. Mirrors the filters on the list page so what you see
 * is what you export.
 */
export async function GET(req: NextRequest) {
  const auth = await requireOperator(req);
  if (auth instanceof NextResponse) return auth;

  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.trim();
  const status = sp.get("status");

  const conditions = [];
  if (q) {
    conditions.push(
      or(
        ilike(subscribers.email, `%${q}%`),
        ilike(subscribers.firstName, `%${q}%`),
        ilike(subscribers.lastName, `%${q}%`),
      ),
    );
  }
  if (status) {
    conditions.push(eq(subscribers.status, status as never));
  }

  const where = conditions.length ? and(...conditions) : sql`true`;

  // Hard cap on rows to keep the function from OOM-ing on a 1M-subscriber
  // export. Operators needing a full dump should run a paginated export
  // (set ?offset=N) or use the DB directly.
  const EXPORT_MAX_ROWS = 50_000;
  const offset = Math.max(0, parseInt(sp.get("offset") ?? "0", 10) || 0);

  const rows = await db
    .select({
      email: subscribers.email,
      firstName: subscribers.firstName,
      lastName: subscribers.lastName,
      status: subscribers.status,
      source: subscribers.source,
      createdAt: subscribers.createdAt,
    })
    .from(subscribers)
    .where(where)
    .orderBy(desc(subscribers.createdAt))
    .limit(EXPORT_MAX_ROWS)
    .offset(offset);

  const header = "email,first_name,last_name,status,source,added_at\n";
  const body = rows
    .map((r) =>
      [
        csv(r.email),
        csv(r.firstName ?? ""),
        csv(r.lastName ?? ""),
        csv(r.status),
        csv(r.source ?? ""),
        csv(r.createdAt.toISOString()),
      ].join(","),
    )
    .join("\n");

  const filename = `subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(header + body, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}

function csv(v: string): string {
  // CSV-injection defense: cells whose first byte is = + - @ \t \r let
  // Excel/Sheets interpret the cell as a formula (=cmd|' /C calc'!A0 →
  // RCE on Windows when the analyst opens the file). Prefix a single quote
  // to neutralize. Combined with the existing escape for quote/comma/CR/LF
  // this covers both the formula-injection and the quoting cases.
  let s = v;
  if (s.length > 0 && /^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
  }
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
