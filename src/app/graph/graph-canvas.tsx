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

// react-force-graph-2d mutates the graphData props in-place (adds .x/.y/.vx),
// so we have to feed it a fresh object every render to avoid the library
// holding on to stale references across re-mounts.
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

export function GraphCanvas({ data }: { data: GraphData }) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({
    w: 800,
    h: 600,
  });
  const [selected, setSelected] = useState<SelectedNode | null>(null);

  // ResizeObserver so the canvas fills the container responsively. Library
  // requires explicit width/height props (it doesn't auto-size).
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
              No address-anchored intel in this window
            </p>
            <p className="text-sm text-[var(--rex-text-muted)]">
              Try a wider window or a different chain. The graph plots
              incident-grade intel that names at least one address.
            </p>
          </div>
        ) : (
          <ForceGraph2D
            graphData={graph}
            width={size.w}
            height={size.h}
            backgroundColor="transparent"
            // Hand-tuned forces so addresses cluster around their owning
            // incidents but co-occurrence edges still pull related clusters
            // together. d3-force defaults make everything stripe.
            d3AlphaDecay={0.025}
            d3VelocityDecay={0.3}
            cooldownTime={4000}
            nodeRelSize={5}
            linkColor={(link) => {
              const l = link as unknown as GraphEdge;
              return l.kind === "address-address"
                ? "rgba(31,168,224,0.35)"
                : "rgba(95,185,31,0.40)";
            }}
            linkWidth={(link) => {
              const l = link as unknown as GraphEdge;
              if (l.kind === "address-address") {
                return Math.min(0.5 + l.weight * 0.6, 3.5);
              }
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
              const label =
                n.kind === "incident"
                  ? n.headline
                  : (n as AddressNode).label || (n as AddressNode).address;
              const isIncident = n.kind === "incident";
              const sev =
                isIncident && (n as IncidentNode).severity
                  ? SEVERITY_COLOR[(n as IncidentNode).severity as string] ??
                    "#5fb91f"
                  : "#5fb91f";
              const fill = isIncident ? sev : "#1fa8e0";
              const radius = isIncident ? 6 : 4;
              const x = n.x ?? 0;
              const y = n.y ?? 0;

              ctx.fillStyle = fill;
              ctx.beginPath();
              ctx.arc(x, y, radius, 0, 2 * Math.PI);
              ctx.fill();

              // Label only when zoomed in enough — graph stays readable
              // when zoomed out by suppressing the text fog.
              if (globalScale > 1.4 && typeof label === "string") {
                const truncated =
                  label.length > 36 ? label.slice(0, 33) + "…" : label;
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
          {data.meta.addressCount === 1 ? "" : "es"} ·{" "}
          {data.meta.edgeCount} edge{data.meta.edgeCount === 1 ? "" : "s"}
        </div>
      </div>

      <Legend />

      {selected && <SelectedDetail node={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)]">
      <Swatch color="#5fb91f" label="Incident" />
      <Swatch color="#1fa8e0" label="Address" />
      <span className="text-[var(--rex-border)]">│</span>
      <Swatch color="rgba(95,185,31,0.6)" label="Incident → address" />
      <Swatch color="rgba(31,168,224,0.6)" label="Address co-occurrence" />
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
  return (
    <div className="rex-card p-4 border-l-2 border-[var(--rex-accent-2)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-accent-2)]">
            Address · {node.chain}
          </div>
          <div className="font-mono text-xs text-white mt-1 break-all">
            {node.address}
          </div>
          {node.label && (
            <div className="text-sm text-[var(--rex-text-muted)] mt-1">
              {node.label}
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
