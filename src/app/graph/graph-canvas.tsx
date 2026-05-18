"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { detailHref } from "@/lib/slug";
import type {
  GraphData,
  GraphEdge,
  GraphNode,
  IncidentNode,
  AddressNode,
} from "@/lib/graph-data";

// react-force-graph-2d touches `window` + canvas at import time, so it has
// to load on the client only. Static fallback while the chunk arrives.
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => (
    <div className="rex-card p-8 text-center text-[var(--rex-text-dim)] font-mono text-xs">
      Loading graph…
    </div>
  ),
});

type SelectedNode = (IncidentNode | AddressNode) & { x?: number; y?: number };

type FGNode = GraphNode & {
  x?: number;
  y?: number;
  fx?: number;
  fy?: number;
};
type FGLink = GraphEdge & { source: string | FGNode; target: string | FGNode };

const SEVERITY_COLOR: Record<string, string> = {
  low: "#8888a0",
  medium: "#60a5fa",
  high: "#fbbf24",
  critical: "#f87171",
};

// Category palette — each address category gets a distinct hue so the
// graph reads at-a-glance ("red = sanctioned, blue = exchange, etc.").
// Chosen to stay distinguishable on the dark background and remain
// colorblind-friendly (red/yellow/blue/green/violet primary, no
// adjacent-pair confusion).
const CATEGORY_COLOR: Record<string, string> = {
  sanctioned: "#ef4444", // red
  "hack-source": "#f97316", // orange
  "hack-destination": "#fb923c", // orange-light
  mixer: "#dc2626", // dark red
  scam: "#b91c1c", // crimson
  "government-seized": "#a855f7", // violet
  exchange: "#3b82f6", // blue
  "market-maker": "#06b6d4", // cyan
  "defi-protocol": "#0ea5e9", // sky
  bridge: "#14b8a6", // teal
  foundation: "#22c55e", // green
  treasury: "#84cc16", // lime
  validator: "#10b981", // emerald
  personality: "#eab308", // gold
  lost: "#94a3b8", // slate
  dormant: "#64748b", // slate-dark
  "mev-bot": "#ec4899", // pink
};

const DEFAULT_ADDRESS_COLOR = "#1fa8e0";

function nodeFill(n: FGNode): string {
  if (n.kind === "incident") {
    const sev = (n as IncidentNode).severity;
    if (sev && SEVERITY_COLOR[sev]) return SEVERITY_COLOR[sev];
    return "#5fb91f";
  }
  const an = n as AddressNode;
  if (an.category && CATEGORY_COLOR[an.category]) {
    return CATEGORY_COLOR[an.category];
  }
  return DEFAULT_ADDRESS_COLOR;
}

function nodeRadius(n: FGNode): number {
  if (n.kind === "incident") return 6;
  const an = n as AddressNode;
  // Sanctioned and hack-related categories pop a touch larger so they
  // catch the eye when scanning a busy graph.
  if (
    an.category === "sanctioned" ||
    an.category === "hack-source" ||
    an.category === "hack-destination" ||
    an.category === "government-seized"
  ) {
    return 5;
  }
  return 4;
}

function nodeLabel(n: FGNode): string {
  if (n.kind === "incident") return n.headline;
  const an = n as AddressNode;
  // Prefer owner_name when available — "Binance 14" reads better than
  // "0x28C6c0…d60" — fall back to existing label, then truncated address.
  if (an.ownerName && an.label && an.ownerName !== an.label) {
    return `${an.ownerName} · ${an.label}`;
  }
  return an.ownerName ?? an.label ?? truncAddress(an.address);
}

function truncAddress(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 8)}…${addr.slice(-4)}`;
}

export function GraphCanvas({ data }: { data: GraphData }) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({
    w: 800,
    h: 600,
  });
  const [selected, setSelected] = useState<SelectedNode | null>(null);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({
        w: el.clientWidth,
        h: Math.max(500, Math.min(900, window.innerHeight - 240)),
      });
    });
    ro.observe(el);
    setSize({
      w: el.clientWidth,
      h: Math.max(500, Math.min(900, window.innerHeight - 240)),
    });
    return () => ro.disconnect();
  }, []);

  const graph = useMemo<{ nodes: FGNode[]; links: FGLink[] }>(
    () => ({
      nodes: data.nodes.map((n) => ({ ...n })),
      links: data.edges.map((e) => ({ ...e })),
    }),
    [data],
  );

  return (
    <div className="space-y-4">
      <div
        ref={wrapperRef}
        className="relative rex-card overflow-hidden"
        style={{
          background:
            "radial-gradient(circle at center, rgba(95,185,31,0.04) 0%, transparent 65%), #0a0a0f",
        }}
      >
        {data.nodes.length === 0 ? (
          <div className="p-16 text-center">
            <p className="font-mono text-xs uppercase tracking-widest text-[var(--rex-text-dim)] mb-2">
              No nodes in this window
            </p>
            <p className="text-sm text-[var(--rex-text-muted)]">
              Try a wider window, a different chain, or switch to
              Institutional / Combined view to see categorized addresses.
            </p>
          </div>
        ) : (
          <ForceGraph2D
            graphData={graph}
            width={size.w}
            height={size.h}
            backgroundColor="transparent"
            d3AlphaDecay={0.025}
            d3VelocityDecay={0.3}
            cooldownTime={4000}
            nodeRelSize={5}
            linkColor={(link) => {
              const l = link as unknown as GraphEdge;
              if (l.kind === "address-address")
                return "rgba(31,168,224,0.35)";
              if (l.kind === "owner-cluster")
                return "rgba(168,85,247,0.25)";
              return "rgba(95,185,31,0.40)";
            }}
            linkWidth={(link) => {
              const l = link as unknown as GraphEdge;
              if (l.kind === "address-address") {
                return Math.min(0.5 + l.weight * 0.6, 3.5);
              }
              if (l.kind === "owner-cluster") return 0.5;
              return 1;
            }}
            linkDirectionalParticles={(link) => {
              const l = link as unknown as GraphEdge;
              return l.kind === "address-address" && l.weight >= 2 ? 2 : 0;
            }}
            linkDirectionalParticleSpeed={0.004}
            linkDirectionalParticleColor={() => "rgba(31,168,224,0.7)"}
            nodeCanvasObject={(node, ctx, globalScale) => {
              const n = node as unknown as FGNode;
              const label = nodeLabel(n);
              const fill = nodeFill(n);
              const radius = nodeRadius(n);
              const x = n.x ?? 0;
              const y = n.y ?? 0;

              ctx.fillStyle = fill;
              ctx.beginPath();
              ctx.arc(x, y, radius, 0, 2 * Math.PI);
              ctx.fill();

              // Ring for high-confidence sanctioned/hack categories —
              // makes them visually shout from across the canvas.
              if (n.kind === "address") {
                const an = n as AddressNode;
                if (
                  an.category === "sanctioned" ||
                  an.category === "government-seized"
                ) {
                  ctx.strokeStyle = "rgba(239,68,68,0.55)";
                  ctx.lineWidth = 1.5;
                  ctx.beginPath();
                  ctx.arc(x, y, radius + 2.5, 0, 2 * Math.PI);
                  ctx.stroke();
                }
              }

              if (globalScale > 1.2 && typeof label === "string") {
                const truncated =
                  label.length > 40 ? label.slice(0, 37) + "…" : label;
                ctx.font = `${10 / globalScale}px ui-monospace, monospace`;
                ctx.textAlign = "left";
                ctx.textBaseline = "middle";
                ctx.fillStyle = "rgba(232,232,240,0.85)";
                ctx.fillText(truncated, x + radius + 3, y);
              }
            }}
            onNodeClick={(node) => {
              const n = node as unknown as SelectedNode;
              setSelected(n);
            }}
          />
        )}

        <div className="absolute top-3 left-3 font-mono text-[10px] uppercase tracking-widest text-[var(--rex-text-dim)] pointer-events-none">
          {data.meta.incidentCount} incident
          {data.meta.incidentCount === 1 ? "" : "s"} ·{" "}
          {data.meta.addressCount} address
          {data.meta.addressCount === 1 ? "" : "es"}
          {data.meta.categorizedCount > 0
            ? ` · ${data.meta.categorizedCount} categorized`
            : ""}{" "}
          · {data.meta.edgeCount} edge{data.meta.edgeCount === 1 ? "" : "s"}
        </div>
      </div>

      <Legend view={data.meta.view} />

      {selected && <SelectedDetail node={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function Legend({ view }: { view: string }) {
  const showCategories = view !== "incidents";
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3 text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)]">
        <Swatch color="#5fb91f" label="Incident" />
        <Swatch color={DEFAULT_ADDRESS_COLOR} label="Address" />
        <span className="text-[var(--rex-border)]">│</span>
        <Swatch color="rgba(95,185,31,0.6)" label="Incident → address" />
        <Swatch color="rgba(31,168,224,0.6)" label="Co-occurrence" />
        {showCategories && (
          <Swatch color="rgba(168,85,247,0.4)" label="Owner cluster" />
        )}
      </div>
      {showCategories && (
        <div className="flex flex-wrap items-center gap-3 text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)]">
          <Swatch color={CATEGORY_COLOR.sanctioned} label="Sanctioned" />
          <Swatch color={CATEGORY_COLOR["hack-source"]} label="Hack" />
          <Swatch
            color={CATEGORY_COLOR["government-seized"]}
            label="Govt. seized"
          />
          <Swatch color={CATEGORY_COLOR.exchange} label="Exchange" />
          <Swatch color={CATEGORY_COLOR["market-maker"]} label="Market maker" />
          <Swatch color={CATEGORY_COLOR.bridge} label="Bridge" />
          <Swatch color={CATEGORY_COLOR.foundation} label="Foundation" />
          <Swatch color={CATEGORY_COLOR.treasury} label="Treasury" />
          <Swatch color={CATEGORY_COLOR.personality} label="Personality" />
          <Swatch color={CATEGORY_COLOR.lost} label="Lost / dormant" />
        </div>
      )}
    </div>
  );
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block w-2.5 h-2.5 rounded-full"
        style={{ background: color }}
      />
      <span>{label}</span>
    </span>
  );
}

function SelectedDetail({
  node,
  onClose,
}: {
  node: SelectedNode;
  onClose: () => void;
}) {
  if (node.kind === "incident") {
    const href = detailHref("/intel", node.publicId, node.headline);
    return (
      <div className="rex-card p-4 border-l-2 border-[var(--rex-accent)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-accent)]">
              Incident · {node.intelKind ?? "intel"}
              {node.severity ? ` · ${node.severity}` : ""}
              {node.category ? ` · ${node.category}` : ""}
            </div>
            <div className="font-semibold text-white mt-1">{node.headline}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--rex-text-dim)] hover:text-white font-mono text-sm"
            aria-label="Close detail"
          >
            ✕
          </button>
        </div>
        <Link
          href={href}
          className="inline-block mt-3 text-[10px] font-mono uppercase tracking-widest text-[var(--rex-accent)] hover:text-white transition-colors"
        >
          Open intel ▸
        </Link>
      </div>
    );
  }
  const href = `/intel/address/${node.chain}/${encodeURIComponent(node.address)}`;
  const sourceLabel = node.primarySource ? sourceDisplay(node.primarySource) : null;
  return (
    <div className="rex-card p-4 border-l-2 border-[var(--rex-accent-2)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-accent-2)]">
            Address · {node.chain}
            {node.category ? ` · ${node.category}` : ""}
            {sourceLabel ? ` · ${sourceLabel}` : ""}
          </div>
          <div className="font-mono text-xs text-white mt-1 break-all">
            {node.address}
          </div>
          {node.ownerName && (
            <div className="text-sm text-white mt-1 font-semibold">
              {node.ownerName}
            </div>
          )}
          {node.label && node.label !== node.ownerName && (
            <div className="text-sm text-[var(--rex-text-muted)] mt-1">
              {node.label}
            </div>
          )}
          {node.confidence != null && (
            <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)] mt-2">
              Confidence: {node.confidence}/100
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-[var(--rex-text-dim)] hover:text-white font-mono text-sm"
          aria-label="Close detail"
        >
          ✕
        </button>
      </div>
      <Link
        href={href}
        className="inline-block mt-3 text-[10px] font-mono uppercase tracking-widest text-[var(--rex-accent-2)] hover:text-white transition-colors"
      >
        Open address page ▸
      </Link>
    </div>
  );
}

function sourceDisplay(src: string): string {
  switch (src) {
    case "ofac":
      return "OFAC";
    case "ofsi":
      return "OFSI";
    case "eu-sanctions":
      return "EU";
    case "rexintel-curated":
      return "RexIntel curated";
    case "rexintel-community":
      return "Community";
    case "defillama":
      return "DefiLlama";
    case "etherscan":
      return "Etherscan";
    case "incident":
      return "Incident";
    default:
      return src;
  }
}
