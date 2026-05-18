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
