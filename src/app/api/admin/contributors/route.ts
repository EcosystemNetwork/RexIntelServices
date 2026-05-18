import { NextRequest, NextResponse } from "next/server";
import { and, desc, ilike, or, sql, eq } from "drizzle-orm";
import {
  db,
  submitters,
  submissions,
  contributionEvents,
} from "@/lib/db";

// Admin-only listing of Circle-authenticated contributors. Joins in
// per-submitter submission counts and a most-recent contribution timestamp
// so the admin panel can show signup volume + engagement without N+1
// queries. Auth is enforced by middleware (PROTECTED_PREFIXES includes
// /api/admin).
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.trim();
  const tier = sp.get("tier")?.trim();
  const sort = (sp.get("sort") ?? "recent_signup").trim();
  const limit = Math.min(parseInt(sp.get("limit") ?? "100"), 500);
  const offset = parseInt(sp.get("offset") ?? "0");

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

  // Sort options map to single columns so the lastLoginAt + points indexes
  // can keep the page snappy as the table grows.
  const orderClause =
    sort === "logins"
      ? sql`${submitters.loginCount} DESC NULLS LAST`
      : sort === "last_login"
        ? sql`${submitters.lastLoginAt} DESC NULLS LAST`
        : sort === "points"
          ? sql`${submitters.points} DESC NULLS LAST`
          : desc(submitters.createdAt);

  const [rows, [{ count }], [totals]] = await Promise.all([
    db
      .select({
        id: submitters.id,
        email: submitters.email,
        slug: submitters.slug,
        displayHandle: submitters.displayHandle,
        walletAddress: submitters.walletAddress,
        walletChain: submitters.walletChain,
        clearanceTier: submitters.clearanceTier,
        points: submitters.points,
        loginCount: submitters.loginCount,
        lastLoginAt: submitters.lastLoginAt,
        createdAt: submitters.createdAt,
        submissionCount: sql<number>`(
          SELECT count(*)::int FROM ${submissions}
          WHERE ${submissions.submitterId} = ${submitters.id}
        )`,
        lastContributionAt: sql<Date | null>`(
          SELECT max(${contributionEvents.awardedAt}) FROM ${contributionEvents}
          WHERE ${contributionEvents.submitterId} = ${submitters.id}
        )`,
      })
      .from(submitters)
      .where(where)
      .orderBy(orderClause)
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(submitters)
      .where(where),
    // Aggregate stats for the header — total signups, ever-logged-in, and
    // last-7d new signups. Computed over the *filtered* set so a "trusted"
    // filter narrows the headline numbers too.
    db
      .select({
        total: sql<number>`count(*)::int`,
        everLoggedIn: sql<number>`count(*) FILTER (WHERE ${submitters.loginCount} > 0)::int`,
        last7dSignups: sql<number>`count(*) FILTER (WHERE ${submitters.createdAt} >= now() - interval '7 days')::int`,
        last7dActive: sql<number>`count(*) FILTER (WHERE ${submitters.lastLoginAt} >= now() - interval '7 days')::int`,
      })
      .from(submitters)
      .where(where),
  ]);

  return NextResponse.json({
    contributors: rows,
    total: count,
    stats: totals ?? {
      total: 0,
      everLoggedIn: 0,
      last7dSignups: 0,
      last7dActive: 0,
    },
  });
}
