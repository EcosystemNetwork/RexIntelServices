import Link from "next/link";
import type { Metadata } from "next";
import { desc, eq, gt, sql } from "drizzle-orm";
import { db, submissions, submitters } from "@/lib/db";
import type { ClearanceTier } from "@/lib/db/schema";
import { PublicShell } from "@/components/public-shell";
import { TIER_THRESHOLDS } from "@/lib/clearance";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Contributors — Rex Intel Services",
  description:
    "Top contributors to Rex Intel Services, ranked by Trust. Trust accrues from accepted intel, address attributions, and citations from later investigations.",
};

const TIER_LABEL: Record<ClearanceTier, string> = {
  open: "Open",
  contributor: "Contributor",
  trusted: "Trusted",
  inner_circle: "Inner Circle",
};

const TIER_ACCENT: Record<ClearanceTier, string> = {
  open: "var(--rex-text-dim)",
  contributor: "var(--rex-text-muted)",
  trusted: "var(--rex-accent-2)",
  inner_circle: "var(--rex-accent)",
};

function displayName(c: {
  displayHandle: string | null;
  walletAddress: string | null;
}): string {
  if (c.displayHandle) return c.displayHandle;
  if (c.walletAddress && c.walletAddress.length >= 10) {
    return `${c.walletAddress.slice(0, 6)}…${c.walletAddress.slice(-4)}`;
  }
  return "anonymous";
}

export default async function ContributorsPage() {
  // Only surface contributors who actually have a confirmed approval —
  // freshly-onboarded zero-point submitters would otherwise pad the page
  // with empty rows. Joined count of approved submissions stays in sync
  // with the per-profile counts shown on /contributors/[slug].
  const rows = await db
    .select({
      id: submitters.id,
      slug: submitters.slug,
      displayHandle: submitters.displayHandle,
      walletAddress: submitters.walletAddress,
      points: submitters.points,
      clearanceTier: submitters.clearanceTier,
      approvedCount: sql<number>`count(${submissions.id}) FILTER (WHERE ${submissions.status} = 'approved')::int`,
    })
    .from(submitters)
    .leftJoin(submissions, eq(submissions.submitterId, submitters.id))
    .where(gt(submitters.points, 0))
    .groupBy(
      submitters.id,
      submitters.slug,
      submitters.displayHandle,
      submitters.walletAddress,
      submitters.points,
      submitters.clearanceTier,
    )
    .orderBy(desc(submitters.points))
    .limit(50);

  return (
    <PublicShell
      classification={[{ text: "● Open Channel // Contributors Leaderboard" }]}
    >
      <main className="max-w-3xl mx-auto px-6 pt-8 md:pt-12 pb-24">
        <header className="mb-8">
          <div
            className="text-[10px] font-mono uppercase tracking-widest mb-2"
            style={{ color: "var(--rex-text-dim)" }}
          >
            ▸ Trust leaderboard
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-semibold tracking-tight text-white mb-3 leading-tight">
            Contributors
          </h1>
          <p
            className="text-sm leading-relaxed max-w-2xl"
            style={{ color: "var(--rex-text-muted)" }}
          >
            Trust accrues from accepted intel, address attributions, and
            citations from later investigations. It only goes up — bad-faith
            actors are handled by clearance freeze, not score deduction.
          </p>
          <div
            className="mt-3 text-[10px] font-mono uppercase tracking-widest flex flex-wrap gap-x-4 gap-y-1"
            style={{ color: "var(--rex-text-dim)" }}
          >
            <span>
              Contributor · ≥{TIER_THRESHOLDS.contributor.toLocaleString()}
            </span>
            <span>Trusted · ≥{TIER_THRESHOLDS.trusted.toLocaleString()}</span>
            <span>
              Inner Circle · ≥{TIER_THRESHOLDS.inner_circle.toLocaleString()}
            </span>
          </div>
        </header>

        {rows.length === 0 ? (
          <div
            className="rex-card-flat p-6 text-sm"
            style={{ color: "var(--rex-text-dim)" }}
          >
            No contributors yet. Be the first —{" "}
            <Link
              href="/submit"
              className="underline hover:text-white transition-colors"
            >
              submit intel
            </Link>
            .
          </div>
        ) : (
          <ol className="space-y-2">
            {rows.map((r, i) => {
              const name = displayName(r);
              const rank = i + 1;
              return (
                <li key={r.id}>
                  <Link
                    href={`/contributors/${r.slug}`}
                    className="rex-card block p-4 hover:bg-[var(--rex-surface-2)] transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="font-display text-xl tabular-nums w-10 text-right"
                        style={{
                          color:
                            rank <= 3
                              ? "var(--rex-accent)"
                              : "var(--rex-text-dim)",
                        }}
                      >
                        {rank}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-display text-base text-white group-hover:text-[var(--rex-accent)] transition-colors truncate">
                          @{name}
                        </div>
                        <div
                          className="text-[10px] font-mono uppercase tracking-widest mt-0.5 flex items-center gap-2"
                          style={{
                            color: TIER_ACCENT[r.clearanceTier],
                          }}
                        >
                          <span>◆ {TIER_LABEL[r.clearanceTier]}</span>
                          <span style={{ color: "var(--rex-text-dim)" }}>
                            ·
                          </span>
                          <span style={{ color: "var(--rex-text-dim)" }}>
                            {r.approvedCount.toLocaleString()} approved
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-display text-xl text-white tabular-nums">
                          {r.points.toLocaleString()}
                        </div>
                        <div
                          className="text-[10px] font-mono uppercase tracking-widest"
                          style={{ color: "var(--rex-text-dim)" }}
                        >
                          Trust
                        </div>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </main>
    </PublicShell>
  );
}
