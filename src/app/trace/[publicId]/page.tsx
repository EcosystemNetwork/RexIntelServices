import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { db, hackTraces, hackTraceHops, addresses } from "@/lib/db";
import { PublicShell } from "@/components/public-shell";
import { explorerUrl, txExplorerUrl } from "@/lib/chains";

export const dynamic = "force-dynamic";

type TraceHop = {
  depth: number;
  fromAddress: string;
  fromLabel: string | null;
  toAddress: string;
  toLabel: string | null;
  toCategory: string | null;
  toOwnerName: string | null;
  toAddressId: string;
  txHash: string;
  amountRaw: string | null;
  tokenSymbol: string | null;
  tokenDecimals: number | null;
  amountUsd: string | null;
  txTimestamp: Date | null;
  terminalReason: string | null;
};

async function loadTrace(publicId: string) {
  const [trace] = await db
    .select()
    .from(hackTraces)
    .where(eq(hackTraces.publicId, publicId))
    .limit(1);
  if (!trace) return null;

  const rawHops = await db
    .select({
      depth: hackTraceHops.depth,
      fromAddressId: hackTraceHops.fromAddressId,
      toAddressId: hackTraceHops.toAddressId,
      txHash: hackTraceHops.txHash,
      amountRaw: hackTraceHops.amountRaw,
      tokenSymbol: hackTraceHops.tokenSymbol,
      tokenDecimals: hackTraceHops.tokenDecimals,
      amountUsd: hackTraceHops.amountUsd,
      txTimestamp: hackTraceHops.txTimestamp,
      terminalReason: hackTraceHops.terminalReason,
    })
    .from(hackTraceHops)
    .where(eq(hackTraceHops.traceId, trace.id))
    .orderBy(asc(hackTraceHops.depth), asc(hackTraceHops.txTimestamp));

  // Pull address rows once for all hop endpoints so we can label them.
  const addrIds = new Set<string>();
  for (const h of rawHops) {
    addrIds.add(h.fromAddressId);
    addrIds.add(h.toAddressId);
  }
  const addrRows = addrIds.size
    ? await db
        .select({
          id: addresses.id,
          address: addresses.address,
          label: addresses.label,
          category: addresses.category,
          ownerName: addresses.ownerName,
        })
        .from(addresses)
    : [];
  const addrById = new Map(addrRows.map((a) => [a.id, a]));

  const hops: TraceHop[] = rawHops.map((h) => {
    const from = addrById.get(h.fromAddressId);
    const to = addrById.get(h.toAddressId);
    return {
      depth: h.depth,
      fromAddress: from?.address ?? "",
      fromLabel: from?.label ?? null,
      toAddress: to?.address ?? "",
      toLabel: to?.label ?? null,
      toCategory: to?.category ?? null,
      toOwnerName: to?.ownerName ?? null,
      toAddressId: h.toAddressId,
      txHash: h.txHash,
      amountRaw: h.amountRaw,
      tokenSymbol: h.tokenSymbol,
      tokenDecimals: h.tokenDecimals,
      amountUsd: h.amountUsd,
      txTimestamp: h.txTimestamp,
      terminalReason: h.terminalReason,
    };
  });

  return { trace, hops };
}

export async function generateMetadata({
  params,
}: {
  params: { publicId: string };
}): Promise<Metadata> {
  const data = await loadTrace(params.publicId);
  if (!data) return { title: "Trace not found · RexIntel" };
  const root = data.trace.rootAddress;
  const short = `${root.slice(0, 8)}…${root.slice(-6)}`;
  return {
    title: `Victim trace ${short} · RexIntel`,
    description: `Outbound flow trace for ${short} on ${data.trace.chain}. ${data.hops.length} hops recorded.`,
  };
}

export default async function TraceResultPage({
  params,
}: {
  params: { publicId: string };
}) {
  const data = await loadTrace(params.publicId);
  if (!data) notFound();
  const { trace, hops } = data;

  const hopsByDepth = new Map<number, TraceHop[]>();
  for (const h of hops) {
    const arr = hopsByDepth.get(h.depth) ?? [];
    arr.push(h);
    hopsByDepth.set(h.depth, arr);
  }
  const depths = [...hopsByDepth.keys()].sort((a, b) => a - b);
  const terminals = hops.filter((h) => h.terminalReason);

  const root = trace.rootAddress.toLowerCase();
  const shortRoot = `${root.slice(0, 10)}…${root.slice(-8)}`;

  return (
    <PublicShell
      classification={[
        { text: "● Public · Victim trace" },
        { text: trace.chain, show: "sm" },
        { text: `Status: ${trace.status}`, show: "md" },
      ]}
    >
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <header className="space-y-2">
          <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-accent)]">
            ● Victim trace · {trace.publicId}
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-[var(--rex-text)]">
            {trace.victimLabel ?? `Outbound flow from ${shortRoot}`}
          </h1>
          <div className="text-[12px] font-mono text-[var(--rex-text-muted)]">
            Root:{" "}
            <a
              href={explorerUrl(trace.chain, root) ?? "#"}
              target="_blank"
              rel="noreferrer"
              className="text-[var(--rex-accent)] underline decoration-dotted underline-offset-2 break-all"
            >
              {root}
            </a>
          </div>
        </header>

        <StatusPanel trace={trace} hops={hops} terminals={terminals} />

        {trace.status === "complete" ? (
          <section className="rex-card p-4 sm:p-5 border border-[var(--rex-accent)]/30 space-y-2">
            <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-accent)]">
              ● Escalate — post a recovery bounty
            </div>
            <div className="text-sm text-[var(--rex-text-muted)] leading-relaxed">
              Trace gave you the where; a bounty gives you the who. Escrow
              USDC on Base — trusted-tier white-hats submit sealed evidence
              packages, curator + you adjudicate, paid out only on
              recovery (or, with a filed police report, info leading to
              arrest).
            </div>
            <Link
              href={`/bounties/new?trace=${encodeURIComponent(trace.publicId)}`}
              className="inline-block text-[11px] font-mono uppercase tracking-widest px-3 py-2 rounded border border-[var(--rex-accent)]/40 text-[var(--rex-accent)] hover:bg-[var(--rex-accent)]/10 transition"
            >
              Post a bounty against this wallet →
            </Link>
          </section>
        ) : null}

        {trace.status === "failed" ? (
          <section className="rex-card p-4 sm:p-5 border border-[var(--rex-warning)]/60">
            <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-warning)]">
              ⚠ Trace failed
            </div>
            <div className="text-sm text-[var(--rex-text-muted)] mt-1">
              {trace.failureReason ?? "Unknown error."}
            </div>
          </section>
        ) : null}

        {depths.length === 0 ? (
          <section className="rex-card p-4 sm:p-5 text-sm text-[var(--rex-text-muted)]">
            No outbound transfers above the dust threshold from this address
            on Ethereum mainnet. Funds either remained at the root wallet or
            moved as a token the v1 tracer doesn&apos;t index.
          </section>
        ) : (
          <section className="rex-card p-4 sm:p-5 space-y-5">
            <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)]">
              Outbound flow — {hops.length} hops across {depths.length} depths
            </div>
            {depths.map((d) => (
              <DepthSection
                key={d}
                depth={d}
                hops={hopsByDepth.get(d) ?? []}
                chain={trace.chain}
              />
            ))}
          </section>
        )}

        <section className="text-[11px] text-[var(--rex-text-dim)] font-mono leading-relaxed border-t border-[var(--rex-border-subtle)] pt-4">
          Trace is part of the RexIntel attribution graph (community-class
          layer). Counterparties surface on{" "}
          <Link
            href="/graph?user_reported=1"
            className="text-[var(--rex-accent)] underline decoration-dotted underline-offset-2"
          >
            /graph with community sources on
          </Link>
          .
        </section>
      </main>
    </PublicShell>
  );
}

function StatusPanel({
  trace,
  hops,
  terminals,
}: {
  trace: Awaited<ReturnType<typeof loadTrace>> extends infer T
    ? T extends { trace: infer U }
      ? U
      : never
    : never;
  hops: TraceHop[];
  terminals: TraceHop[];
}) {
  if (!trace) return null;
  const created = trace.createdAt ? new Date(trace.createdAt) : null;
  const completed = trace.completedAt ? new Date(trace.completedAt) : null;
  return (
    <section className="rex-card p-4 sm:p-5 grid grid-cols-2 md:grid-cols-4 gap-4">
      <Stat label="Hops recorded" value={String(hops.length)} />
      <Stat label="Terminal nodes" value={String(terminals.length)} />
      <Stat
        label="Max depth"
        value={`${trace.maxHops}`}
        sub={`Explored ${trace.hopsExplored}`}
      />
      <Stat
        label="Created"
        value={
          created
            ? created.toISOString().slice(0, 16).replace("T", " ")
            : "—"
        }
        sub={
          completed
            ? `Completed ${completed.toISOString().slice(11, 16)} UTC`
            : trace.status
        }
      />
    </section>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div>
      <div className="text-[9px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)]">
        {label}
      </div>
      <div className="text-base font-display text-[var(--rex-text)] mt-0.5">{value}</div>
      {sub ? (
        <div className="text-[10px] font-mono text-[var(--rex-text-dim)] mt-0.5">
          {sub}
        </div>
      ) : null}
    </div>
  );
}

function DepthSection({
  depth,
  hops,
  chain,
}: {
  depth: number;
  hops: TraceHop[];
  chain: string;
}) {
  return (
    <div className="space-y-2">
      <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-accent)]">
        ● Depth {depth}
      </div>
      <ul className="space-y-2">
        {hops.map((h) => (
          <HopRow key={`${h.txHash}-${h.toAddress}`} hop={h} chain={chain} />
        ))}
      </ul>
    </div>
  );
}

function HopRow({ hop, chain }: { hop: TraceHop; chain: string }) {
  const amountHuman = formatAmount(
    hop.amountRaw,
    hop.tokenDecimals,
    hop.tokenSymbol,
  );
  const toAddr = hop.toAddress;
  const toShort = `${toAddr.slice(0, 8)}…${toAddr.slice(-6)}`;
  const terminalLabel = terminalReasonLabel(hop.terminalReason);
  const categoryTag = hop.toCategory
    ? `${hop.toCategory}${hop.toOwnerName ? ` · ${hop.toOwnerName}` : ""}`
    : null;

  return (
    <li className="border border-[var(--rex-border-subtle)] rounded-sm px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-mono">
      <span className="text-[var(--rex-text-muted)]">→</span>
      <Link
        href={`/intel/address/${chain}/${toAddr}`}
        className="text-[var(--rex-accent)] hover:underline"
      >
        {hop.toLabel ?? toShort}
      </Link>
      {(() => {
        const addrHref = explorerUrl(chain, toAddr);
        return addrHref ? (
          <a
            href={addrHref}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] uppercase tracking-widest text-[var(--rex-text-dim)] hover:text-[var(--rex-text)]"
            title={toAddr}
          >
            explorer ↗
          </a>
        ) : null;
      })()}
      {categoryTag ? (
        <span
          className="text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded-sm"
          style={{
            color: "var(--rex-accent-2)",
            background: "rgba(31,168,224,0.10)",
          }}
        >
          {categoryTag}
        </span>
      ) : null}
      <span className="text-[var(--rex-text-muted)]">{amountHuman}</span>
      {hop.amountUsd ? (
        <span className="text-[var(--rex-text-dim)]">
          (~${Number(hop.amountUsd).toLocaleString()})
        </span>
      ) : null}
      {(() => {
        const txHref = txExplorerUrl(chain, hop.txHash) ?? `https://etherscan.io/tx/${hop.txHash}`;
        return (
          <a
            href={txHref}
            target="_blank"
            rel="noreferrer"
            className="text-[var(--rex-text-dim)] hover:text-[var(--rex-text)] ml-auto"
          >
            tx ↗
          </a>
        );
      })()}
      {terminalLabel ? (
        <span
          className="text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded-sm"
          style={{
            color: "var(--rex-accent)",
            background: "rgba(95,185,31,0.10)",
          }}
        >
          {terminalLabel}
        </span>
      ) : null}
    </li>
  );
}

function formatAmount(
  raw: string | null,
  decimals: number | null,
  symbol: string | null,
): string {
  if (!raw || decimals == null) return symbol ?? "—";
  // BigInt → human; trims trailing zeros for readability.
  try {
    const big = BigInt(raw);
    const divisor = 10n ** BigInt(decimals);
    const whole = big / divisor;
    const frac = big % divisor;
    const fracStr = frac.toString().padStart(decimals, "0").slice(0, 6);
    const trimmed = fracStr.replace(/0+$/, "");
    return `${whole}${trimmed ? `.${trimmed}` : ""} ${symbol ?? ""}`.trim();
  } catch {
    return symbol ?? "—";
  }
}

function terminalReasonLabel(r: string | null): string | null {
  if (!r) return null;
  switch (r) {
    case "attribution_match":
      return "TERMINAL · known endpoint";
    case "dust":
      return "TERMINAL · dust";
    case "depth":
      return "TERMINAL · depth limit";
    case "still_moving":
      return "TERMINAL · still moving";
    default:
      return null;
  }
}

