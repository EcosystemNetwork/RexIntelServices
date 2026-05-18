import ConnectWalletButton from "@/components/connect-wallet-button";
import type { ClearanceTier } from "@/lib/db/schema";

const TIER_LABEL: Record<ClearanceTier, string> = {
  open: "Open",
  contributor: "Contributor",
  trusted: "Trusted",
  inner_circle: "Inner Circle",
};

const TIER_HOWTO: Record<ClearanceTier, string> = {
  open: "Anyone — no wallet required.",
  contributor:
    "Connect a wallet and earn one accepted contribution. Tip-class intel pays 5 points; incidents pay 50.",
  trusted:
    "Sustained accepted contributions. ~5 accepted incidents or many tips. Earn 50+ points.",
  inner_circle:
    "Top-tier contributors only. Reserved for the handful actively running investigations. 250+ points.",
};

interface Props {
  required: ClearanceTier;
  current: ClearanceTier;
  reason?: string;
}

/**
 * Server-rendered paywall for tier-gated content surfaces. Shows the user
 * what tier is needed, what they currently have, and how to upgrade. The
 * embedded ConnectWalletButton handles the connect → sign → verify flow
 * inline so users don't have to bounce to another page.
 */
export function ClearanceWall({ required, current, reason }: Props) {
  const isConnected = current !== "open";
  return (
    <aside
      className="rex-card-flat p-6 my-6"
      style={{
        borderColor: "rgba(95,185,31,0.30)",
        background: "rgba(95,185,31,0.04)",
      }}
    >
      <div
        className="text-[10px] font-mono uppercase tracking-widest mb-2"
        style={{ color: "var(--rex-accent)" }}
      >
        ▸ Clearance required · {TIER_LABEL[required]}
      </div>
      <h3 className="font-display text-lg text-[var(--rex-text)] mb-2 leading-tight">
        {reason ?? "Connect a wallet to unlock the full investigation."}
      </h3>
      <p
        className="text-sm leading-relaxed mb-4"
        style={{ color: "var(--rex-text-muted)" }}
      >
        {TIER_HOWTO[required]}
      </p>
      <p
        className="text-[11px] font-mono uppercase tracking-widest mb-4"
        style={{ color: "var(--rex-text-dim)" }}
      >
        Current: {TIER_LABEL[current]}
        {isConnected ? " (keep contributing to level up)" : ""}
      </p>
      <ConnectWalletButton />
    </aside>
  );
}
