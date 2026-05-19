import { NextRequest, NextResponse } from "next/server";
import { desc, ilike, or, sql, eq } from "drizzle-orm";
import {
  db,
  submitters,
  submissions,
  contributionEvents,
} from "@/lib/db";
import { getSession } from "@/lib/auth";

// CSV export of the same dataset rendered at /users. Mirrors the filters
// from /api/admin/contributors so the export honors whatever the admin is
// currently viewing — but drops the page-size cap. Single un-paginated
// dump; submitters is small enough that a stream is overkill.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.trim();
  const tier = sp.get("tier")?.trim();
  const sort = (sp.get("sort") ?? "recent_signup").trim();

  const conditions = [];
  if (q) {
    conditions.push(
      or(
        ilike(submitters.email, `%${q}%`),
        ilike(submitters.walletAddress, `%${q}%`),
        ilike(submitters.displayHandle, `%${q}%`),
        ilike(submitters.slug, `%${q}%`),
      ),
    );
  }
  if (tier) {
    conditions.push(eq(submitters.clearanceTier, tier as never));
  }
  const where = conditions.length
    ? conditions.reduce((a, b) => sql`${a} AND ${b}`)
    : sql`true`;

  const orderClause =
    sort === "logins"
      ? sql`${submitters.loginCount} DESC NULLS LAST`
      : sort === "last_login"
        ? sql`${submitters.lastLoginAt} DESC NULLS LAST`
        : sort === "points"
          ? sql`${submitters.points} DESC NULLS LAST`
          : desc(submitters.createdAt);

  const rows = await db
    .select({
      email: submitters.email,
      walletAddress: submitters.walletAddress,
      walletChain: submitters.walletChain,
      displayHandle: submitters.displayHandle,
      slug: submitters.slug,
      clearanceTier: submitters.clearanceTier,
      points: submitters.points,
      loginCount: submitters.loginCount,
      lastLoginAt: submitters.lastLoginAt,
      createdAt: submitters.createdAt,
      submissionCount: sql<number>`count(distinct ${submissions.id})::int`,
      lastContributionAt: sql<Date | null>`max(${contributionEvents.awardedAt})`,
    })
    .from(submitters)
    .leftJoin(submissions, eq(submissions.submitterId, submitters.id))
    .leftJoin(
      contributionEvents,
      eq(contributionEvents.submitterId, submitters.id),
    )
    .where(where)
    .groupBy(
      submitters.id,
      submitters.email,
      submitters.walletAddress,
      submitters.walletChain,
      submitters.displayHandle,
      submitters.slug,
      submitters.clearanceTier,
      submitters.points,
      submitters.loginCount,
      submitters.lastLoginAt,
      submitters.createdAt,
    )
    .orderBy(orderClause);

  const headers = [
    "email",
    "wallet_address",
    "wallet_chain",
    "display_handle",
    "slug",
    "clearance_tier",
    "points",
    "login_count",
    "last_login_at",
    "created_at",
    "submission_count",
    "last_contribution_at",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(
      [
        csvCell(r.email),
        csvCell(r.walletAddress),
        csvCell(r.walletChain),
        csvCell(r.displayHandle),
        csvCell(r.slug),
        csvCell(r.clearanceTier),
        r.points,
        r.loginCount,
        csvCell(r.lastLoginAt ? new Date(r.lastLoginAt).toISOString() : null),
        csvCell(new Date(r.createdAt).toISOString()),
        r.submissionCount,
        csvCell(
          r.lastContributionAt
            ? new Date(r.lastContributionAt).toISOString()
            : null,
        ),
      ].join(","),
    );
  }
  const csv = lines.join("\n");

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="rexintel-contributors-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

// RFC 4180-ish: wrap any cell containing comma, quote, CR or LF in double
// quotes and double-up internal quotes. Excel and Google Sheets both
// accept this; nulls become empty cells.
function csvCell(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
