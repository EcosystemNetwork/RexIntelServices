import type { Metadata } from "next";
import { PublicShell } from "@/components/public-shell";
import { PrizeClaimList } from "./prize-claim-list";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your Prize Pool Wins — Rex Intel Services",
  description:
    "Claim your monthly intel prize pool winnings. Pull-based USDC payouts from the IntelPrizePool contract on Base.",
};

export default function PrizeClaimPage() {
  return (
    <PublicShell
      classification={[{ text: "● Open Channel // Prize Pool Claims" }]}
    >
      <main className="max-w-3xl mx-auto px-6 pt-10 pb-24">
        <header className="mb-8">
          <p
            className="text-[11px] uppercase tracking-widest"
            style={{ color: "var(--rex-text-dim)" }}
          >
            Monthly settlement
          </p>
          <h1 className="font-display text-3xl text-white mt-1">
            Your prize pool wins
          </h1>
          <p
            className="mt-3 text-sm max-w-2xl"
            style={{ color: "var(--rex-text-dim)" }}
          >
            Top intel each month splits the community prize pool 50/25/15/7/3
            of 80% of the pot. Wins are settled on the 1st via the
            IntelPrizePool contract on Base — pull-based, so you claim into
            your Magic wallet whenever you want.
          </p>
        </header>
        <PrizeClaimList />
      </main>
    </PublicShell>
  );
}
