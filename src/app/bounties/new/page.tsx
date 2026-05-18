import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db, hackTraces } from "@/lib/db";
import { PublicShell } from "@/components/public-shell";
import { PostBountyForm } from "./post-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Post a Recovery Bounty · RexIntel",
  description:
    "Escrow USDC on Base. Trusted white-hat researchers will submit sealed evidence packages. A curator and you sign off before payout.",
};

export default async function PostBountyPage({
  searchParams,
}: {
  searchParams: { trace?: string };
}) {
  // Custody-rail kill switch — see /api/bounties POST handler. We render
  // a "paused" notice instead of the form so victims aren't filling out
  // 12 fields that 503 on submit.
  if (process.env.BOUNTY_CUSTODY_RAIL_ENABLED !== "true") {
    return (
      <PublicShell
        classification={[
          { text: "● Public · Bounties paused" },
        ]}
      >
        <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12 space-y-6">
          <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-warning)]">
            ● Bounty intake temporarily paused
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-white">
            Custody rail is being rebuilt.
          </h1>
          <p className="text-sm text-[var(--rex-text-muted)] max-w-2xl leading-relaxed">
            RexIntel is rebuilding the bounty escrow rail. New bounty
            submissions are paused until the replacement custody answer ships.
            Existing bounties remain visible at{" "}
            <a
              href="/bounties"
              className="text-[var(--rex-accent)] hover:underline"
            >
              /bounties
            </a>
            . If you&apos;re a victim with an active trace, you can still
            file the trace at{" "}
            <a
              href="/trace"
              className="text-[var(--rex-accent)] hover:underline"
            >
              /trace
            </a>{" "}
            and we&apos;ll surface it once intake reopens.
          </p>
        </main>
      </PublicShell>
    );
  }

  // Optional anchor to an existing trace. If supplied we display the trace
  // summary so the victim sees they're posting against the right wallet.
  let trace: {
    publicId: string;
    chain: string;
    rootAddress: string;
    submitterEmail: string | null;
    lossUsd: string | null;
  } | null = null;
  if (searchParams.trace) {
    const [t] = await db
      .select({
        publicId: hackTraces.publicId,
        chain: hackTraces.chain,
        rootAddress: hackTraces.rootAddress,
        submitterEmail: hackTraces.submitterEmail,
        lossUsd: hackTraces.lossUsd,
      })
      .from(hackTraces)
      .where(eq(hackTraces.publicId, searchParams.trace))
      .limit(1);
    trace = t ?? null;
  }

  return (
    <PublicShell
      classification={[
        { text: "● Public · Post a bounty" },
        { text: "USDC on Base · Custodial escrow", show: "sm" },
      ]}
    >
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <header className="space-y-2">
          <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-accent)]">
            ● Post a recovery bounty
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-white">
            Put money on the table.
          </h1>
          <p className="text-sm text-[var(--rex-text-muted)] max-w-2xl leading-relaxed">
            Trusted-tier researchers will submit sealed evidence. A curator
            reviews; you sign off on the outcome before any payout. No
            platform fee. Bond mechanics and the two-strike bad-faith
            policy protect you from spam claims.
          </p>
        </header>

        {trace ? (
          <section className="rex-card p-4 sm:p-5 space-y-2">
            <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)]">
              ● Anchoring to trace
            </div>
            <div className="text-[12px] font-mono text-[var(--rex-text-muted)] break-all">
              {trace.chain} · {trace.rootAddress}
            </div>
            <div className="text-[10px] font-mono text-[var(--rex-text-dim)]">
              The email on this bounty must match the email used on the
              trace.
            </div>
          </section>
        ) : null}

        <PostBountyForm
          traceContext={
            trace
              ? {
                  publicId: trace.publicId,
                  prefilledEmail: trace.submitterEmail ?? "",
                  lossUsd: trace.lossUsd ? Number(trace.lossUsd) : null,
                }
              : null
          }
        />

        <section className="text-[11px] text-[var(--rex-text-dim)] font-mono leading-relaxed border-t border-[var(--rex-border-subtle)] pt-4 space-y-2">
          <div>
            After you submit, you&apos;ll receive funding instructions. The
            bounty isn&apos;t visible publicly until USDC arrives in the
            custodial escrow wallet.
          </div>
          <div>
            <strong className="text-[var(--rex-warning)]">
              Info → arrest bounties:
            </strong>{" "}
            require a filed police report. We don&apos;t verify the report;
            we just record the case ref. Bounty hunters take their own
            legal risk; we are an intermediary.
          </div>
        </section>
      </main>
    </PublicShell>
  );
}
