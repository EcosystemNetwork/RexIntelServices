import { BountyOverview } from "./overview";

export const dynamic = "force-dynamic";

export default function BountiesAdminPage() {
  return (
    <main className="p-4 sm:p-6 space-y-4">
      <header className="space-y-1">
        <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-accent)]">
          ● Bounty operations
        </div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-white">
          Bounties overview
        </h1>
        <p className="text-sm text-[var(--rex-text-muted)]">
          Health view of the bounty surface. Stuck payouts and unfunded
          drafts surface here so you can spot operational issues before
          users do.
        </p>
      </header>
      <BountyOverview />
    </main>
  );
}
