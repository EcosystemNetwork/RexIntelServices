import { NextRequest } from "next/server";
import { desc, eq, ilike, or, sql, and } from "drizzle-orm";
import { db, subscribers } from "@/lib/db";

/**
 * GET /api/subscribers/export?status=active&q=foo
 * Returns a CSV download. Mirrors the filters on the list page so what you see
 * is what you export.
 */
export async function GET(req: NextRequest) {
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
    .orderBy(desc(subscribers.createdAt));

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
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}
