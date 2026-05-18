import { ClaimQueue } from "./claim-queue";

export const dynamic = "force-dynamic";

export default function BountyClaimsAdminPage() {
  return (
    <main className="p-4 sm:p-6 space-y-4">
      <header className="space-y-1">
        <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-accent)]">
          ● Curator queue
        </div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-white">
          Bounty claims
        </h1>
        <p className="text-sm text-[var(--rex-text-muted)]">
          Adjudicate open white-hat claims. Accept moves USDC out of escrow
          to the claimant; reject burns the bond on bad-faith verdicts (and
          counts toward the 2-strike ban).
        </p>
      </header>
      <ClaimQueue />
    </main>
  );
}
