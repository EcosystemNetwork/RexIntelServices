"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { detailHref } from "@/lib/slug";
import { explorerUrl } from "@/lib/chains";
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
// react-force-graph rewrites link.source / link.target from string id → node
// object once the simulation initializes. We treat the runtime shape as
// `string | FGNode` even though GraphEdge declares them as strings — without
// this widening, TS narrows the false branch of the typeof check to `never`.
type FGLink = Omit<GraphEdge, "source" | "target"> & {
  source: string | FGNode;
  target: string | FGNode;
};

function linkEndpointId(end: string | FGNode): string {
  return typeof end === "string" ? end : end.id;
}

// Minimal handle surface from react-force-graph-2d — we only need the
// methods we actually call (zoom controls). Avoids dragging the full
// ForceGraphInstance type in.
type FGRef = {
  zoomToFit: (durationMs?: number, paddingPx?: number) => void;
  centerAt: (x?: number, y?: number, durationMs?: number) => void;
  zoom: (k?: number, durationMs?: number) => void;
  d3ReheatSimulation: () => void;
};

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

function nodeSearchHaystack(n: FGNode): string {
  if (n.kind === "incident") {
    const parts = [n.headline, n.category, n.severity, n.intelKind];
    return parts.filter(Boolean).join(" ").toLowerCase();
  }
  const an = n as AddressNode;
  const parts = [
    an.address,
    an.label,
    an.ownerName,
    an.category,
    an.ownerKind,
    an.primarySource,
    an.chain,
  ];
  return parts.filter(Boolean).join(" ").toLowerCase();
}

export function GraphCanvas({ data }: { data: GraphData }) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const fgRef = useRef<FGRef | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({
    w: 800,
    h: 600,
  });
  const [selected, setSelected] = useState<SelectedNode | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [focusId, setFocusId] = useState<string | null>(null);
  const [focusHops, setFocusHops] = useState<1 | 2>(1);

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

  // Adjacency map: node id → set of neighbor node ids. Used for hover and
  // focus-mode highlighting without an O(E) scan on every render.
  const adjacency = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const e of data.edges) {
      const s = typeof e.source === "string" ? e.source : (e.source as FGNode).id;
      const t = typeof e.target === "string" ? e.target : (e.target as FGNode).id;
      if (!m.has(s)) m.set(s, new Set());
      if (!m.has(t)) m.set(t, new Set());
      m.get(s)!.add(t);
      m.get(t)!.add(s);
    }
    return m;
  }, [data.edges]);

  // Address node id → incident nodes that reference it. Powers the "Appears in
  // stories" section of the modal so a wallet links back to its source intel.
  const incidentsByAddressId = useMemo(() => {
    const incidents = new Map<string, IncidentNode>();
    for (const n of data.nodes) {
      if (n.kind === "incident") incidents.set(n.id, n);
    }
    const m = new Map<string, IncidentNode[]>();
    for (const e of data.edges) {
      if (e.kind !== "incident-address") continue;
      const s = typeof e.source === "string" ? e.source : (e.source as FGNode).id;
      const t = typeof e.target === "string" ? e.target : (e.target as FGNode).id;
      const inc = incidents.get(s);
      if (!inc) continue;
      const arr = m.get(t) ?? [];
      arr.push(inc);
      m.set(t, arr);
    }
    return m;
  }, [data.nodes, data.edges]);

  // Expand from a seed id by `hops` edges. Returns the closed set including
  // the seed. Used by focus mode to isolate a 1- or 2-hop neighborhood.
  const expand = useCallback(
    (seed: string, hops: number): Set<string> => {
      const visited = new Set<string>([seed]);
      let frontier: string[] = [seed];
      for (let i = 0; i < hops; i++) {
        const next: string[] = [];
        for (const id of frontier) {
          const nbrs = adjacency.get(id);
          if (!nbrs) continue;
          for (const n of nbrs) {
            if (!visited.has(n)) {
              visited.add(n);
              next.push(n);
            }
          }
        }
        frontier = next;
      }
      return visited;
    },
    [adjacency],
  );

  // Normalized search query. Empty string → no filter.
  const searchTerm = search.trim().toLowerCase();

  // Set of node ids that pass the active search/focus filters. `null` means
  // "no active filter" — every node renders at full opacity.
  const visibleIds = useMemo<Set<string> | null>(() => {
    if (focusId) return expand(focusId, focusHops);
    if (!searchTerm) return null;
    const matches = new Set<string>();
    for (const n of data.nodes) {
      if (nodeSearchHaystack(n as FGNode).includes(searchTerm)) {
        matches.add(n.id);
      }
    }
    // Pull in neighbors of matches so the user sees the context, not a
    // sea of disconnected hits.
    const expanded = new Set(matches);
    for (const id of matches) {
      const nbrs = adjacency.get(id);
      if (nbrs) for (const nb of nbrs) expanded.add(nb);
    }
    return expanded;
  }, [data.nodes, adjacency, searchTerm, focusId, focusHops, expand]);

  // Hover-driven highlight ring — superset of the visible filter.
  const hoverNeighbors = useMemo<Set<string> | null>(() => {
    if (!hoverId) return null;
    const s = new Set<string>([hoverId]);
    const nbrs = adjacency.get(hoverId);
    if (nbrs) for (const n of nbrs) s.add(n);
    return s;
  }, [hoverId, adjacency]);

  const matchCount = useMemo(() => {
    if (focusId) return visibleIds?.size ?? 0;
    if (!searchTerm) return 0;
    let n = 0;
    for (const node of data.nodes) {
      if (nodeSearchHaystack(node as FGNode).includes(searchTerm)) n++;
    }
    return n;
  }, [data.nodes, searchTerm, focusId, visibleIds]);

  const graph = useMemo<{ nodes: FGNode[]; links: FGLink[] }>(
    () => ({
      nodes: data.nodes.map((n) => ({ ...n })),
      links: data.edges.map((e) => ({ ...e })),
    }),
    [data],
  );

  const handleZoomFit = useCallback(() => {
    fgRef.current?.zoomToFit(600, 40);
  }, []);
  const handleZoomReset = useCallback(() => {
    fgRef.current?.zoom(1, 400);
    fgRef.current?.centerAt(0, 0, 400);
  }, []);
  const handleReheat = useCallback(() => {
    fgRef.current?.d3ReheatSimulation();
  }, []);

  // After the layout cools, fit everything to viewport on first render. The
  // dependency on data.meta.generatedAt makes this re-run when filters
  // change and we get a fresh data slice.
  useEffect(() => {
    const t = setTimeout(() => fgRef.current?.zoomToFit(400, 40), 1200);
    return () => clearTimeout(t);
  }, [data.meta.generatedAt]);

  const dimmed = (id: string): boolean => {
    if (hoverNeighbors) return !hoverNeighbors.has(id);
    if (visibleIds) return !visibleIds.has(id);
    return false;
  };

  return (
    <div className="space-y-4">
      <CanvasToolbar
        search={search}
        onSearch={setSearch}
        matchCount={matchCount}
        searchActive={Boolean(searchTerm)}
        focusActive={Boolean(focusId)}
        focusLabel={
          focusId
            ? (data.nodes.find((n) => n.id === focusId)
                ? nodeLabel(
                    data.nodes.find((n) => n.id === focusId) as FGNode,
                  )
                : null) ?? "node"
            : null
        }
        focusHops={focusHops}
        onFocusHopsChange={setFocusHops}
        onClearFocus={() => setFocusId(null)}
        onZoomFit={handleZoomFit}
        onZoomReset={handleZoomReset}
        onReheat={handleReheat}
        nodeCount={data.meta.nodeCount}
        edgeCount={data.meta.edgeCount}
      />

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
            // The 3rd-party lib's ref type is `MutableRefObject<ForceGraphMethods>`.
            // Our local FGRef subsets the methods we touch; cast through `any`
            // to bridge the two without dragging in the full upstream generics.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ref={fgRef as any}
            graphData={graph}
            width={size.w}
            height={size.h}
            backgroundColor="transparent"
            d3AlphaDecay={0.025}
            d3VelocityDecay={0.3}
            cooldownTime={4000}
            nodeRelSize={5}
            enableNodeDrag={true}
            linkColor={(link) => {
              const l = link as unknown as FGLink;
              const s = linkEndpointId(l.source);
              const t = linkEndpointId(l.target);
              const isDim = dimmed(s) || dimmed(t);
              const alpha = isDim ? 0.06 : null;
              if (l.kind === "address-address")
                return alpha != null
                  ? `rgba(31,168,224,${alpha})`
                  : "rgba(31,168,224,0.35)";
              if (l.kind === "owner-cluster")
                return alpha != null
                  ? `rgba(168,85,247,${alpha})`
                  : "rgba(168,85,247,0.25)";
              return alpha != null
                ? `rgba(95,185,31,${alpha})`
                : "rgba(95,185,31,0.40)";
            }}
            linkWidth={(link) => {
              const l = link as unknown as FGLink;
              if (l.kind === "address-address") {
                const e = l as GraphEdge & { weight: number };
                return Math.min(0.5 + e.weight * 0.6, 3.5);
              }
              if (l.kind === "owner-cluster") return 0.5;
              return 1;
            }}
            linkDirectionalParticles={(link) => {
              const l = link as unknown as FGLink;
              const s = linkEndpointId(l.source);
              const t = linkEndpointId(l.target);
              if (dimmed(s) || dimmed(t)) return 0;
              if (l.kind !== "address-address") return 0;
              const w = (l as GraphEdge & { weight: number }).weight;
              return w >= 2 ? 2 : 0;
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
              const isDim = dimmed(n.id);
              const isHover = hoverId === n.id;
              const isFocus = focusId === n.id;

              ctx.globalAlpha = isDim ? 0.18 : 1;
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

              if (isHover || isFocus) {
                ctx.strokeStyle = isFocus
                  ? "rgba(95,185,31,0.95)"
                  : "rgba(232,232,240,0.85)";
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(x, y, radius + 4, 0, 2 * Math.PI);
                ctx.stroke();
              }

              if (
                (globalScale > 1.2 || isHover || isFocus) &&
                typeof label === "string"
              ) {
                const truncated =
                  label.length > 40 ? label.slice(0, 37) + "…" : label;
                ctx.font = `${10 / globalScale}px ui-monospace, monospace`;
                ctx.textAlign = "left";
                ctx.textBaseline = "middle";
                ctx.fillStyle =
                  isHover || isFocus
                    ? "rgba(232,232,240,1)"
                    : "rgba(232,232,240,0.85)";
                ctx.fillText(truncated, x + radius + 3, y);
              }
              ctx.globalAlpha = 1;
            }}
            onNodeClick={(node, event) => {
              const n = node as unknown as SelectedNode;
              // Shift-click → toggle focus mode on this node, keeping its
              // neighborhood and dimming everything else. Plain click →
              // open detail panel.
              if (
                (event as unknown as { shiftKey?: boolean })?.shiftKey === true
              ) {
                setFocusId((cur) => (cur === n.id ? null : n.id));
                return;
              }
              setSelected(n);
            }}
            onNodeHover={(node) => {
              const n = (node as unknown as FGNode) ?? null;
              setHoverId(n ? n.id : null);
              if (typeof document !== "undefined") {
                document.body.style.cursor = n ? "pointer" : "default";
              }
            }}
            onBackgroundClick={() => {
              // Clicking empty canvas escapes focus mode.
              if (focusId) setFocusId(null);
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

        <div className="absolute bottom-3 right-3 font-mono text-[9px] uppercase tracking-widest text-[var(--rex-text-dim)] pointer-events-none">
          shift+click: focus · click bg: reset
        </div>
      </div>

      <Legend view={data.meta.view} />

      {selected && (
        <NodeDetailModal
          node={selected}
          linkedIncidents={
            selected.kind === "address"
              ? (incidentsByAddressId.get(selected.id) ?? [])
              : []
          }
          isFocused={focusId === selected.id}
          onClose={() => setSelected(null)}
          onFocus={() => {
            setFocusId(selected.id);
            setSelected(null);
          }}
          onClearFocus={() => setFocusId(null)}
        />
      )}
    </div>
  );
}

function NodeDetailModal({
  node,
  linkedIncidents,
  isFocused,
  onClose,
  onFocus,
  onClearFocus,
}: {
  node: SelectedNode;
  linkedIncidents: IncidentNode[];
  isFocused: boolean;
  onClose: () => void;
  onFocus: () => void;
  onClearFocus: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-hidden="true"
      />
      <div
        className="relative z-10 w-full max-w-xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <SelectedDetail
          node={node}
          linkedIncidents={linkedIncidents}
          isFocused={isFocused}
          onClose={onClose}
          onFocus={onFocus}
          onClearFocus={onClearFocus}
        />
      </div>
    </div>
  );
}

function CanvasToolbar({
  search,
  onSearch,
  matchCount,
  searchActive,
  focusActive,
  focusLabel,
  focusHops,
  onFocusHopsChange,
  onClearFocus,
  onZoomFit,
  onZoomReset,
  onReheat,
  nodeCount,
  edgeCount,
}: {
  search: string;
  onSearch: (v: string) => void;
  matchCount: number;
  searchActive: boolean;
  focusActive: boolean;
  focusLabel: string | null;
  focusHops: 1 | 2;
  onFocusHopsChange: (h: 1 | 2) => void;
  onClearFocus: () => void;
  onZoomFit: () => void;
  onZoomReset: () => void;
  onReheat: () => void;
  nodeCount: number;
  edgeCount: number;
}) {
  return (
    <div className="rex-card p-3 flex flex-wrap items-center gap-2 text-[10px] font-mono">
      <div className="relative flex-1 min-w-[200px] max-w-[400px]">
        <input
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search address, owner, headline…"
          className="rex-input w-full pl-7 pr-2 py-1.5 text-xs"
        />
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--rex-text-dim)] pointer-events-none">
          ⌕
        </span>
        {searchActive && (
          <button
            type="button"
            onClick={() => onSearch("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--rex-text-dim)] hover:text-[var(--rex-text)]"
            aria-label="Clear search"
          >
            ✕
          </button>
        )}
      </div>

      {searchActive && (
        <span className="text-[var(--rex-text-dim)] uppercase tracking-widest">
          {matchCount} match{matchCount === 1 ? "" : "es"}
        </span>
      )}

      {focusActive && (
        <span
          className="flex items-center gap-1.5 px-2 py-1 rounded-sm border border-[var(--rex-accent)] text-[var(--rex-accent)] uppercase tracking-widest"
          title={focusLabel ?? undefined}
        >
          ◉ Focused: {truncForChip(focusLabel)}
          <button
            type="button"
            onClick={onClearFocus}
            className="ml-1 text-[var(--rex-text-dim)] hover:text-[var(--rex-text)]"
            aria-label="Clear focus"
          >
            ✕
          </button>
        </span>
      )}

      {focusActive && (
        <div className="flex items-center gap-1">
          <span className="text-[var(--rex-text-dim)] uppercase tracking-widest">
            Hops
          </span>
          <button
            type="button"
            onClick={() => onFocusHopsChange(1)}
            className={`px-2 py-1 rounded-sm border uppercase tracking-widest transition-colors ${
              focusHops === 1
                ? "border-[var(--rex-accent)] bg-[rgba(95,185,31,0.08)] text-[var(--rex-text)]"
                : "border-[var(--rex-border-subtle)] text-[var(--rex-text-dim)]"
            }`}
          >
            1
          </button>
          <button
            type="button"
            onClick={() => onFocusHopsChange(2)}
            className={`px-2 py-1 rounded-sm border uppercase tracking-widest transition-colors ${
              focusHops === 2
                ? "border-[var(--rex-accent)] bg-[rgba(95,185,31,0.08)] text-[var(--rex-text)]"
                : "border-[var(--rex-border-subtle)] text-[var(--rex-text-dim)]"
            }`}
          >
            2
          </button>
        </div>
      )}

      <div className="ml-auto flex items-center gap-1">
        <ToolbarBtn onClick={onZoomFit}>Fit</ToolbarBtn>
        <ToolbarBtn onClick={onZoomReset}>Reset</ToolbarBtn>
        <ToolbarBtn onClick={onReheat} title="Re-run the layout simulation">
          ↻ Reheat
        </ToolbarBtn>
        <span className="text-[var(--rex-text-dim)] ml-2 uppercase tracking-widest">
          {nodeCount}n · {edgeCount}e
        </span>
      </div>
    </div>
  );
}

function ToolbarBtn({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="px-2 py-1 rounded-sm border border-[var(--rex-border-subtle)] text-[var(--rex-text-dim)] hover:border-[var(--rex-accent)] hover:text-[var(--rex-text)] uppercase tracking-widest transition-colors"
    >
      {children}
    </button>
  );
}

function truncForChip(label: string | null): string {
  if (!label) return "node";
  if (label.length <= 24) return label;
  return label.slice(0, 21) + "…";
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
  linkedIncidents,
  isFocused,
  onClose,
  onFocus,
  onClearFocus,
}: {
  node: SelectedNode;
  linkedIncidents: IncidentNode[];
  isFocused: boolean;
  onClose: () => void;
  onFocus: () => void;
  onClearFocus: () => void;
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
            <div className="font-semibold text-[var(--rex-text)] mt-1">{node.headline}</div>
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
        <div className="mt-3 flex items-center gap-3">
          <Link
            href={href}
            className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-accent)] hover:text-[var(--rex-text)] transition-colors"
          >
            Open intel ▸
          </Link>
          <FocusToggle
            isFocused={isFocused}
            onFocus={onFocus}
            onClearFocus={onClearFocus}
          />
        </div>
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
          <div className="font-mono text-xs text-[var(--rex-text)] mt-1 break-all">
            {(() => {
              const href = explorerUrl(node.chain, node.address);
              return href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--rex-accent-2)] underline decoration-dotted underline-offset-2 hover:decoration-solid"
                >
                  {node.address}
                </a>
              ) : (
                node.address
              );
            })()}
          </div>
          {node.ownerName && (
            <div className="text-sm text-[var(--rex-text)] mt-1 font-semibold">
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
          className="text-[var(--rex-text-dim)] hover:text-[var(--rex-text)] font-mono text-sm"
          aria-label="Close detail"
        >
          ✕
        </button>
      </div>
      {linkedIncidents.length > 0 && (
        <div className="mt-4 pt-3 border-t border-[var(--rex-border-subtle)]">
          <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-text-dim)] mb-2">
            Appears in {linkedIncidents.length} stor
            {linkedIncidents.length === 1 ? "y" : "ies"}
          </div>
          <ul className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {linkedIncidents.map((inc) => (
              <li key={inc.id} className="text-xs leading-snug">
                <Link
                  href={detailHref("/intel", inc.publicId, inc.headline)}
                  className="text-[var(--rex-text)] hover:text-[var(--rex-accent)] transition-colors"
                >
                  <span className="text-[var(--rex-accent)] mr-1.5">▸</span>
                  {inc.headline}
                </Link>
                {(inc.intelKind || inc.severity) && (
                  <span className="ml-1 font-mono text-[10px] text-[var(--rex-text-dim)] uppercase tracking-widest">
                    {[inc.intelKind, inc.severity].filter(Boolean).join(" · ")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-3 flex items-center gap-3">
        <Link
          href={href}
          className="text-[10px] font-mono uppercase tracking-widest text-[var(--rex-accent-2)] hover:text-[var(--rex-text)] transition-colors"
        >
          Open address page ▸
        </Link>
        <FocusToggle
          isFocused={isFocused}
          onFocus={onFocus}
          onClearFocus={onClearFocus}
        />
      </div>
    </div>
  );
}

function FocusToggle({
  isFocused,
  onFocus,
  onClearFocus,
}: {
  isFocused: boolean;
  onFocus: () => void;
  onClearFocus: () => void;
}) {
  return (
    <button
      type="button"
      onClick={isFocused ? onClearFocus : onFocus}
      className="text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded-sm border border-[var(--rex-border-subtle)] text-[var(--rex-text-dim)] hover:border-[var(--rex-accent)] hover:text-[var(--rex-text)] transition-colors"
    >
      {isFocused ? "Exit focus" : "◉ Focus"}
    </button>
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
