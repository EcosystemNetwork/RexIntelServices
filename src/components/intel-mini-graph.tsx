"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { detailHref } from "@/lib/slug";
import { explorerUrl } from "@/lib/chains";
import type { IntelSubgraph } from "@/lib/graph-data";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => (
    <div className="rex-card-flat p-6 text-center text-[var(--rex-text-dim)] font-mono text-[10px]">
      Loading mini-graph…
    </div>
  ),
});

const SEVERITY_COLOR: Record<string, string> = {
  low: "#8888a0",
  medium: "#60a5fa",
  high: "#fbbf24",
  critical: "#f87171",
};

// Mirror of the palette in /graph/graph-canvas so a node looks the same
// in the per-story mini-graph as it does on the big graph. If the big
// canvas palette changes, sync this map.
const CATEGORY_COLOR: Record<string, string> = {
  sanctioned: "#ef4444",
  "hack-source": "#f97316",
  "hack-destination": "#fb923c",
  mixer: "#dc2626",
  scam: "#b91c1c",
  "government-seized": "#a855f7",
  exchange: "#3b82f6",
  "market-maker": "#06b6d4",
  "defi-protocol": "#0ea5e9",
  bridge: "#14b8a6",
  foundation: "#22c55e",
  treasury: "#84cc16",
  validator: "#10b981",
  personality: "#eab308",
  lost: "#94a3b8",
  dormant: "#64748b",
  "mev-bot": "#ec4899",
};

const DEFAULT_ADDRESS_COLOR = "#1fa8e0";
const ROOT_INCIDENT_COLOR = "#5fb91f";
const CO_INCIDENT_COLOR = "rgba(95,185,31,0.55)";

type FGNode = {
  id: string;
  kind: "incident" | "address";
  // root vs co-incident only matters visually; not part of any logic.
  isRoot?: boolean;
  label: string;
  // address-only fields
  chain?: string;
  address?: string;
  category?: string | null;
  ownerName?: string | null;
  // incident-only fields
  publicId?: string;
  headline?: string;
  severity?: string;
  // force-graph runtime fields
  x?: number;
  y?: number;
  fx?: number;
  fy?: number;
};

type FGLink = {
  source: string;
  target: string;
  role: "subject" | "counterparty" | "observed";
  fromRoot: boolean;
};

function nodeFill(n: FGNode): string {
  if (n.kind === "incident") {
    if (n.isRoot) return ROOT_INCIDENT_COLOR;
    if (n.severity && SEVERITY_COLOR[n.severity]) {
      return SEVERITY_COLOR[n.severity];
    }
    return CO_INCIDENT_COLOR;
  }
  if (n.category && CATEGORY_COLOR[n.category]) {
    return CATEGORY_COLOR[n.category];
  }
  return DEFAULT_ADDRESS_COLOR;
}

function truncAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

type SelectedAddress = {
  chain: string;
  address: string;
  label: string | null;
  category: string | null;
  ownerName: string | null;
  role: "subject" | "counterparty" | "observed";
};

type SelectedIncident = {
  publicId: string;
  headline: string;
  severity?: string;
  isRoot: boolean;
};

type Selected =
  | { kind: "address"; data: SelectedAddress }
  | { kind: "incident"; data: SelectedIncident }
  | null;

/**
 * Per-story mini address graph. Mounted on the intel detail page when the
 * incident has ≥1 linked address — renders the incident + its addresses
 * + up-to-12 other approved incidents that share any of those addresses.
 * Click any node for a detail card; click "Open in full graph" to jump
 * to /graph for the institutional / multi-window view.
 */
export function IntelMiniGraph({ data }: { data: IntelSubgraph }) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({
    w: 600,
    h: 320,
  });
  const [selected, setSelected] = useState<Selected>(null);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      // Cap mini-graph height — it shouldn't push the body fold past
      // a single viewport on mobile. 320px is enough to lay out 12+
      // address nodes around the root without crowding.
      setSize({ w: el.clientWidth, h: 320 });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: 320 });
    return () => ro.disconnect();
  }, []);

  const graph = useMemo<{ nodes: FGNode[]; links: FGLink[] }>(() => {
    const nodes: FGNode[] = [];

    // Root incident — pinned at center so the layout reads "this article
    // + its addresses + neighbors" instead of a generic blob.
    nodes.push({
      id: data.incident.id,
      kind: "incident",
      isRoot: true,
      label: data.incident.headline,
      publicId: data.incident.publicId,
      headline: data.incident.headline,
      severity: data.incident.severity ?? undefined,
      fx: 0,
      fy: 0,
    });

    for (const a of data.addresses) {
      nodes.push({
        id: a.id,
        kind: "address",
        label: a.ownerName ?? a.label ?? truncAddress(a.address),
        chain: a.chain,
        address: a.address,
        category: a.category,
        ownerName: a.ownerName,
      });
    }

    for (const c of data.coIncidents) {
      nodes.push({
        id: c.id,
        kind: "incident",
        isRoot: false,
        label: c.headline,
        publicId: c.publicId,
        headline: c.headline,
        severity: c.severity ?? undefined,
      });
    }

    const rootId = data.incident.id;
    const links: FGLink[] = data.edges.map((e) => ({
      source: e.source,
      target: e.target,
      role: e.role,
      fromRoot: e.source === rootId,
    }));

    return { nodes, links };
  }, [data]);

  const onNodeClick = (node: unknown) => {
    const n = node as FGNode;
    if (n.kind === "incident") {
      setSelected({
        kind: "incident",
        data: {
          publicId: n.publicId ?? "",
          headline: n.headline ?? "",
          severity: n.severity,
          isRoot: !!n.isRoot,
        },
      });
      return;
    }
    const addr = data.addresses.find((a) => a.id === n.id);
    if (!addr) return;
    setSelected({
      kind: "address",
      data: {
        chain: addr.chain,
        address: addr.address,
        label: addr.label,
        category: addr.category,
        ownerName: addr.ownerName,
        role: data.rolesByAddressId[addr.id] ?? "observed",
      },
    });
  };

  return (
    <div className="space-y-3">
      <div
        ref={wrapperRef}
        className="rex-card-flat relative overflow-hidden"
        style={{
          background:
            "radial-gradient(circle at center, rgba(95,185,31,0.05) 0%, transparent 70%), var(--rex-surface-2)",
        }}
      >
        <ForceGraph2D
          graphData={graph}
          width={size.w}
          height={size.h}
          backgroundColor="transparent"
          d3AlphaDecay={0.04}
          d3VelocityDecay={0.4}
          cooldownTime={2500}
          nodeRelSize={5}
          linkColor={(link) => {
            const l = link as unknown as FGLink;
            return l.fromRoot
              ? "rgba(95,185,31,0.55)"
              : "rgba(31,168,224,0.35)";
          }}
          linkWidth={(link) => ((link as unknown as FGLink).fromRoot ? 1.5 : 0.8)}
          nodeCanvasObject={(node, ctx, globalScale) => {
            const n = node as unknown as FGNode;
            const fill = nodeFill(n);
            const radius =
              n.kind === "incident" ? (n.isRoot ? 7 : 5) : 4.5;
            const x = n.x ?? 0;
            const y = n.y ?? 0;

            ctx.fillStyle = fill;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, 2 * Math.PI);
            ctx.fill();

            // Ring the root incident so the eye lands on "this article"
            // without reading any labels.
            if (n.isRoot) {
              ctx.strokeStyle = "rgba(95,185,31,0.55)";
              ctx.lineWidth = 1.5;
              ctx.beginPath();
              ctx.arc(x, y, radius + 3, 0, 2 * Math.PI);
              ctx.stroke();
            }

            if (globalScale > 1.4) {
              const truncated =
                n.label.length > 32 ? n.label.slice(0, 29) + "…" : n.label;
              ctx.font = `${10 / globalScale}px ui-monospace, monospace`;
              ctx.textAlign = "left";
              ctx.textBaseline = "middle";
              ctx.fillStyle = "rgba(232,232,240,0.85)";
              ctx.fillText(truncated, x + radius + 3, y);
            }
          }}
          onNodeClick={onNodeClick}
        />

        <div className="absolute top-2 left-2 font-mono text-[10px] uppercase tracking-widest text-[var(--rex-text-dim)] pointer-events-none">
          {data.addresses.length} address
          {data.addresses.length === 1 ? "" : "es"} ·{" "}
          {data.coIncidents.length} co-incident
          {data.coIncidents.length === 1 ? "" : "s"}
        </div>
        <Link
          href="/graph"
          className="absolute bottom-2 right-2 text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded-sm border border-[var(--rex-accent)] text-[var(--rex-accent)] bg-[rgba(10,10,15,0.6)] hover:bg-[rgba(95,185,31,0.12)] transition-colors"
        >
          Open in full graph ▸
        </Link>
      </div>

      {selected && (
        <SelectedDetail
          selected={selected}
          onClose={() => setSelected(null)}
        />
      )}

      <div className="flex flex-wrap items-center gap-3 text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)]">
        <Swatch color={ROOT_INCIDENT_COLOR} label="This story" />
        <Swatch color={CO_INCIDENT_COLOR} label="Co-incident" />
        <Swatch color={DEFAULT_ADDRESS_COLOR} label="Address" />
        <Swatch color={CATEGORY_COLOR.sanctioned} label="Sanctioned" />
        <Swatch color={CATEGORY_COLOR["hack-source"]} label="Hack" />
        <Swatch color={CATEGORY_COLOR.exchange} label="Exchange" />
        <Swatch color={CATEGORY_COLOR.mixer} label="Mixer" />
      </div>
    </div>
  );
}

function SelectedDetail({
  selected,
  onClose,
}: {
  selected: Exclude<Selected, null>;
  onClose: () => void;
}) {
  if (selected.kind === "incident") {
    const d = selected.data;
    if (d.isRoot) {
      return (
        <div className="rex-card-flat p-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-accent)]">
              This story
            </div>
            <div className="text-sm text-[var(--rex-text)] mt-0.5 line-clamp-2">
              {d.headline}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--rex-text-dim)] hover:text-[var(--rex-text)] font-mono text-sm"
            aria-label="Close detail"
          >
            ✕
          </button>
        </div>
      );
    }
    const href = detailHref("/intel", d.publicId, d.headline);
    return (
      <div className="rex-card-flat p-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-accent)]">
            Co-incident
            {d.severity ? ` · ${d.severity}` : ""}
          </div>
          <Link
            href={href}
            className="text-sm text-[var(--rex-text)] hover:text-[var(--rex-accent)] mt-0.5 block line-clamp-2"
          >
            {d.headline}
          </Link>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-[var(--rex-text-dim)] hover:text-[var(--rex-text)] font-mono text-sm"
          aria-label="Close detail"
        >
          ✕
        </button>
      </div>
    );
  }

  const a = selected.data;
  const href = `/intel/address/${a.chain}/${encodeURIComponent(a.address)}`;
  const explorer = explorerUrl(a.chain, a.address);
  return (
    <div className="rex-card-flat p-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-accent-2)]">
          Address · {a.chain} · {a.role}
          {a.category ? ` · ${a.category}` : ""}
        </div>
        <Link
          href={href}
          className="font-mono text-xs text-[var(--rex-text)] hover:text-[var(--rex-accent-2)] break-all block mt-0.5"
        >
          {a.address}
        </Link>
        {(a.ownerName || a.label) && (
          <div className="text-xs text-[var(--rex-text-muted)] mt-0.5">
            {a.ownerName ?? a.label}
          </div>
        )}
        {explorer && (
          <a
            href={explorer}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)] hover:text-[var(--rex-accent-2)] mt-1 inline-block"
          >
            Explorer ↗
          </a>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="text-[var(--rex-text-dim)] hover:text-[var(--rex-text)] font-mono text-sm"
        aria-label="Close detail"
      >
        ✕
      </button>
    </div>
  );
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block w-2 h-2 rounded-full"
        style={{ background: color }}
      />
      <span>{label}</span>
    </span>
  );
}
