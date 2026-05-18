"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createWalletClient,
  custom,
  encodeFunctionData,
  type Address,
  type Hex,
} from "viem";
import { base, baseSepolia } from "viem/chains";

type Prize = {
  yearMonth: string;
  monthYYYYMM: number;
  amount: string;
  txHash: string | null;
  place: number;
  pendingWei: string;
  claimed: boolean;
};

type ApiResponse = {
  contributor: { walletAddress: string; submitterId: string } | null;
  contract: string | null;
  chainId: 8453 | 84532;
  prizes: Prize[];
};

const CLAIM_ABI = [
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [{ name: "month", type: "uint256" }],
    outputs: [],
  },
] as const;

const PLACE_LABEL = ["1st", "2nd", "3rd", "4th", "5th"];

function formatYearMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function explorerTxUrl(chainId: number, txHash: string): string {
  const base = chainId === 84532 ? "https://sepolia.basescan.org" : "https://basescan.org";
  return `${base}/tx/${txHash}`;
}

export function PrizeClaimList() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [claimingMonth, setClaimingMonth] = useState<number | null>(null);
  const [errorByMonth, setErrorByMonth] = useState<Record<number, string>>({});
  const [txByMonth, setTxByMonth] = useState<Record<number, string>>({});

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/intel/prizes/me", {
        credentials: "same-origin",
      });
      if (res.ok) setData((await res.json()) as ApiResponse);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const claim = useCallback(
    async (monthYYYYMM: number) => {
      if (!data?.contract || !data.contributor) return;
      setErrorByMonth((prev) => ({ ...prev, [monthYYYYMM]: "" }));
      setClaimingMonth(monthYYYYMM);
      try {
        const publishableKey =
          process.env.NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY;
        if (!publishableKey) {
          throw new Error("Magic publishable key not configured");
        }
        const rpcUrl =
          process.env.NEXT_PUBLIC_MAGIC_RPC_URL ?? "https://mainnet.base.org";
        const chainId = Number(
          process.env.NEXT_PUBLIC_MAGIC_CHAIN_ID ?? "8453",
        );
        // Lazy-load the Magic SDK so the package isn't pulled in for users
        // who never hit the prize page.
        const mod = (await import("magic-sdk")) as unknown as {
          Magic: new (
            key: string,
            opts: { network: { rpcUrl: string; chainId: number } },
          ) => { rpcProvider: unknown };
        };
        const magic = new mod.Magic(publishableKey, {
          network: { rpcUrl, chainId },
        });

        const chain = data.chainId === 84532 ? baseSepolia : base;
        // viem's `custom` transport accepts any EIP-1193 provider. Magic
        // exposes one via `magic.rpcProvider` — the wallet client signs
        // the tx with Magic-held keys without ever exposing them to JS.
        const wallet = createWalletClient({
          account: data.contributor.walletAddress as Address,
          chain,
          transport: custom(magic.rpcProvider as Parameters<typeof custom>[0]),
        });
        const txHash = (await wallet.sendTransaction({
          to: data.contract as Address,
          data: encodeFunctionData({
            abi: CLAIM_ABI,
            functionName: "claim",
            args: [BigInt(monthYYYYMM)],
          }),
        })) as Hex;
        setTxByMonth((prev) => ({ ...prev, [monthYYYYMM]: txHash }));
        // Poll once after a few seconds so the "claimed" badge flips
        // without forcing a manual reload.
        setTimeout(() => refresh(), 4_000);
      } catch (e) {
        setErrorByMonth((prev) => ({
          ...prev,
          [monthYYYYMM]:
            e instanceof Error ? e.message : "Claim failed — try again",
        }));
      } finally {
        setClaimingMonth(null);
      }
    },
    [data, refresh],
  );

  const { claimable, claimed, pending } = useMemo(() => {
    const out = { claimable: [] as Prize[], claimed: [] as Prize[], pending: [] as Prize[] };
    for (const p of data?.prizes ?? []) {
      if (p.claimed) out.claimed.push(p);
      else if (p.pendingWei !== "0") out.claimable.push(p);
      else out.pending.push(p);
    }
    return out;
  }, [data]);

  if (loading && !data) {
    return (
      <p className="text-sm" style={{ color: "var(--rex-text-dim)" }}>
        Loading your prize history…
      </p>
    );
  }

  if (!data?.contributor) {
    return (
      <div className="rex-card p-5">
        <p className="text-sm text-white">
          Sign in to see your prize history. Use the Sign in button in the
          header — same email you submitted intel with.
        </p>
      </div>
    );
  }

  if (!data.contract) {
    return (
      <div className="rex-card p-5">
        <p className="text-sm text-white">
          The prize pool contract isn&apos;t configured on this environment yet.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {claimable.length > 0 && (
        <section>
          <h2 className="text-[11px] uppercase tracking-widest mb-3"
            style={{ color: "var(--rex-accent)" }}
          >
            Ready to claim
          </h2>
          <ul className="flex flex-col gap-3">
            {claimable.map((p) => (
              <li key={p.monthYYYYMM} className="rex-card p-4 flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-4">
                  <div>
                    <div className="font-display text-xl text-white">
                      ${p.amount} USDC
                    </div>
                    <div
                      className="text-[11px] uppercase tracking-widest mt-1"
                      style={{ color: "var(--rex-text-dim)" }}
                    >
                      {PLACE_LABEL[p.place - 1] ?? `#${p.place}`} · {formatYearMonth(p.yearMonth)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => claim(p.monthYYYYMM)}
                    disabled={claimingMonth === p.monthYYYYMM}
                    className="rex-btn whitespace-nowrap"
                  >
                    {claimingMonth === p.monthYYYYMM ? "Signing…" : "Claim USDC"}
                  </button>
                </div>
                {txByMonth[p.monthYYYYMM] && (
                  <a
                    href={explorerTxUrl(data.chainId, txByMonth[p.monthYYYYMM]!)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-mono text-[var(--rex-accent)] hover:underline"
                  >
                    tx {txByMonth[p.monthYYYYMM]!.slice(0, 10)}… ▸
                  </a>
                )}
                {errorByMonth[p.monthYYYYMM] && (
                  <p className="text-[11px] text-red-400" role="alert">
                    {errorByMonth[p.monthYYYYMM]}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {pending.length > 0 && (
        <section>
          <h2 className="text-[11px] uppercase tracking-widest mb-3"
            style={{ color: "var(--rex-text-dim)" }}
          >
            Settlement pending
          </h2>
          <ul className="flex flex-col gap-2">
            {pending.map((p) => (
              <li
                key={p.monthYYYYMM}
                className="rex-card p-4 text-sm flex items-baseline justify-between"
              >
                <span className="text-white">
                  ${p.amount} USDC — {PLACE_LABEL[p.place - 1] ?? `#${p.place}`}, {formatYearMonth(p.yearMonth)}
                </span>
                <span
                  className="text-[11px] uppercase tracking-widest"
                  style={{ color: "var(--rex-text-dim)" }}
                >
                  on-chain settle pending
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {claimed.length > 0 && (
        <section>
          <h2 className="text-[11px] uppercase tracking-widest mb-3"
            style={{ color: "var(--rex-text-dim)" }}
          >
            Claimed
          </h2>
          <ul className="flex flex-col gap-2">
            {claimed.map((p) => (
              <li
                key={p.monthYYYYMM}
                className="rex-card p-4 text-sm flex items-baseline justify-between"
              >
                <span style={{ color: "var(--rex-text-dim)" }}>
                  ${p.amount} USDC — {PLACE_LABEL[p.place - 1] ?? `#${p.place}`}, {formatYearMonth(p.yearMonth)}
                </span>
                {p.txHash && (
                  <a
                    href={explorerTxUrl(data.chainId, p.txHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-mono text-[var(--rex-text-dim)] hover:text-white"
                  >
                    settlement tx ▸
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {claimable.length === 0 && pending.length === 0 && claimed.length === 0 && (
        <div className="rex-card p-5">
          <p className="text-sm text-white">No prize wins yet.</p>
          <p
            className="text-sm mt-2"
            style={{ color: "var(--rex-text-dim)" }}
          >
            Submit intel that lands in the monthly top 5 and the next
            settlement on the 1st will pay your wallet.
          </p>
        </div>
      )}
    </div>
  );
}
