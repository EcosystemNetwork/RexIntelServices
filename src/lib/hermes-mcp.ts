/**
 * Hermes MCP server — wraps the /api/hermes/* surface as a Model Context
 * Protocol server so the Nous Research `hermes` agent (and any other
 * MCP-compatible client) can call RexIntel as a first-class tool provider.
 *
 * Transport: Streamable HTTP. A single POST endpoint at /api/hermes/mcp
 * accepts JSON-RPC 2.0 requests and returns a JSON response. No SSE here —
 * every tool is synchronous and small, so streaming buys nothing.
 *
 * Auth: same bearer token (HERMES_OPERATOR_TOKEN) that gates the REST
 * surface. Hermes adds it via the `headers:` block in its `mcp_servers`
 * config. The /api/hermes/mcp route checks the token before dispatching.
 *
 * The REST routes under /api/hermes/{healthz,context,graph,intel,address}
 * remain in place untouched — this module re-implements the same logic
 * against the same db/lib building blocks so both surfaces stay live in
 * parallel. Two callers, two protocols, one source of state.
 */

import { and, desc, eq, sql } from "drizzle-orm";
import { addresses, db, intelAddresses, submissions } from "@/lib/db";
import type { IntelPayload } from "@/lib/db/schema";
import { fetchGraphData, fetchLostCryptoStats, fetchValueStats } from "@/lib/graph-data";

const MCP_PROTOCOL_VERSION = "2025-06-18";
const SERVER_NAME = "rexintel-hermes";
const SERVER_VERSION = "0.1.0";

// Mirrors the REST address route's category whitelist. Kept inline so the
// MCP file is self-contained — if a new category is added in the schema,
// update both places (they'll be caught by the next end-to-end test).
const VALID_ADDRESS_CATEGORIES = new Set([
  "exchange",
  "defi-protocol",
  "treasury",
  "foundation",
  "bridge",
  "mixer",
  "sanctioned",
  "government-seized",
  "lost",
  "dormant",
  "hack-source",
  "hack-destination",
  "validator",
  "personality",
  "market-maker",
  "mev-bot",
  "scam",
]);
const VALID_INTEL_ROLES = new Set(["subject", "counterparty", "observed"]);
const VALID_INTEL_KINDS = new Set(["tip", "original", "incident"]);

// ─── Tool registry ──────────────────────────────────────────────────────

type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

type ToolDef = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: ToolHandler;
};

const TOOLS: ToolDef[] = [
  {
    name: "rexintel_healthz",
    description:
      "Up-check for RexIntel. Returns site status plus snapshot counts (incidents, originals, addresses, pending queue) when authorized.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: async () => {
      let dbOk = false;
      try {
        await db.execute(sql`SELECT 1`);
        dbOk = true;
      } catch {
        dbOk = false;
      }
      const incidents = await db.execute(
        sql`SELECT COUNT(*) AS n FROM submissions WHERE type = 'intel' AND status = 'approved' AND payload->>'kind' = 'incident'`,
      );
      const originals = await db.execute(
        sql`SELECT COUNT(*) AS n FROM submissions WHERE type = 'intel' AND status = 'approved' AND payload->>'kind' = 'original'`,
      );
      const addressCount = await db.execute(
        sql`SELECT COUNT(*) AS n FROM addresses`,
      );
      const pending = await db.execute(
        sql`SELECT COUNT(*) AS n FROM submissions WHERE status = 'pending'`,
      );
      return {
        ok: true,
        service: "rexintel",
        timestamp: new Date().toISOString(),
        db: { ok: dbOk },
        counts: {
          incidents: Number((incidents.rows[0] as { n: number }).n),
          originals: Number((originals.rows[0] as { n: number }).n),
          addresses: Number((addressCount.rows[0] as { n: number }).n),
          pending: Number((pending.rows[0] as { n: number }).n),
        },
      };
    },
  },
  {
    name: "rexintel_context",
    description:
      "Big-picture site snapshot. Returns graph value stats, lost-crypto totals, chain distribution, recent incidents, pending queue, and category mix. Call this at the start of an operating loop to know what state RexIntel is in.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: async () => {
      const [value, lost, chains, recent, pending, cats] = await Promise.all([
        fetchValueStats(),
        fetchLostCryptoStats(5),
        db.execute(
          sql`SELECT chain, COUNT(*)::int AS n FROM addresses GROUP BY chain ORDER BY n DESC`,
        ),
        db
          .select({
            publicId: submissions.publicId,
            payload: submissions.payload,
            publishedAt: submissions.publishedAt,
          })
          .from(submissions)
          .where(
            and(
              eq(submissions.type, "intel"),
              eq(submissions.status, "approved"),
              sql`${submissions.payload}->>'kind' = 'incident'`,
            ),
          )
          .orderBy(desc(submissions.publishedAt))
          .limit(10),
        db
          .select({
            id: submissions.id,
            publicId: submissions.publicId,
            type: submissions.type,
            payload: submissions.payload,
            createdAt: submissions.createdAt,
          })
          .from(submissions)
          .where(eq(submissions.status, "pending"))
          .orderBy(desc(submissions.createdAt))
          .limit(10),
        db.execute(
          sql`SELECT COALESCE(category::text, '(none)') AS category, COUNT(*)::int AS n FROM addresses GROUP BY category ORDER BY n DESC`,
        ),
      ]);

      type IntelShape = {
        headline?: string;
        kind?: string;
        severity?: string;
        category?: string;
      };

      return {
        ok: true,
        timestamp: new Date().toISOString(),
        valueStats: value,
        lostCryptoStats: lost,
        chains: chains.rows,
        recentIncidents: recent.map((r) => {
          const p = r.payload as IntelShape;
          return {
            publicId: r.publicId,
            headline: p?.headline,
            kind: p?.kind,
            severity: p?.severity,
            category: p?.category,
            publishedAt: r.publishedAt,
          };
        }),
        pending: pending.map((r) => {
          const p = r.payload as IntelShape;
          return {
            id: r.id,
            publicId: r.publicId,
            type: r.type,
            headline: p?.headline ?? null,
            createdAt: r.createdAt,
          };
        }),
        categoryMix: cats.rows,
      };
    },
  },
  {
    name: "rexintel_graph",
    description:
      "Programmatic dump of the address graph. Same filter semantics as the public /graph page. Returns nodes, edges, and meta.",
    inputSchema: {
      type: "object",
      properties: {
        window: {
          type: "string",
          description: "Time window: e.g. '30d', '90d', '1y', 'all'.",
        },
        kind: {
          type: "string",
          description: "Intel kind filter: 'incident', 'original', or 'tip'.",
        },
        chain: {
          type: "string",
          description:
            "Chain slug (ethereum, bitcoin, solana, etc.) to filter to.",
        },
        view: {
          type: "string",
          enum: ["incidents", "institutional", "combined"],
          description:
            "View mode. 'incidents' = incident-anchored only; 'institutional' = categorized addresses (OFAC, exchanges, foundations); 'combined' = both.",
        },
        category: {
          type: "string",
          description:
            "Address category filter (exchange, sanctioned, mixer, etc.).",
        },
      },
      additionalProperties: false,
    },
    handler: async (args) => {
      const data = await fetchGraphData({
        window: (args.window as string | undefined) ?? null,
        kind: (args.kind as string | undefined) ?? null,
        chain: (args.chain as string | undefined) ?? null,
        view: (args.view as string | undefined) ?? null,
        category: (args.category as string | undefined) ?? null,
      });
      return { ok: true, ...data };
    },
  },
  {
    name: "rexintel_intel_upsert",
    description:
      "Create or update an intel submission (incident, original, or tip). Matches existing rows by headline. Hermes-authored intel publishes directly as approved — no curator queue. Returns { action: 'inserted'|'updated', publicId, intelUrl }.",
    inputSchema: {
      type: "object",
      properties: {
        headline: {
          type: "string",
          minLength: 8,
          description: "Title of the intel piece. Idempotency key.",
        },
        kind: {
          type: "string",
          enum: ["tip", "original", "incident"],
          description:
            "'tip' = community sighting/short brief. 'original' = in-house signal at editorial-bar grade. 'incident' = evergreen postmortem.",
        },
        body: {
          type: "string",
          minLength: 50,
          description: "Full body, markdown OK.",
        },
        category: { type: "string" },
        severity: {
          type: "string",
          enum: ["low", "medium", "high", "critical"],
        },
        anonymous: { type: "boolean" },
        sources: { type: "array", items: { type: "string" } },
        links: { type: "array", items: { type: "string" } },
        personas: { type: "array", items: { type: "string" } },
      },
      required: ["headline", "kind", "body"],
      additionalProperties: false,
    },
    handler: async (args) => {
      const headline = String(args.headline ?? "");
      const kind = String(args.kind ?? "");
      const body = String(args.body ?? "");
      if (headline.length < 8) {
        throw new Error("headline must be at least 8 characters");
      }
      if (!VALID_INTEL_KINDS.has(kind)) {
        throw new Error(
          `kind must be one of tip|original|incident (got ${kind})`,
        );
      }
      if (body.length < 50) {
        throw new Error("body must be at least 50 characters");
      }

      const payload: IntelPayload = {
        headline,
        kind: kind as IntelPayload["kind"],
        category: args.category as string | undefined,
        severity: (args.severity as IntelPayload["severity"]) ?? "medium",
        anonymous: (args.anonymous as boolean | undefined) ?? true,
        body,
        sources: args.sources as string[] | undefined,
        links: args.links as string[] | undefined,
        personas: args.personas as IntelPayload["personas"],
      };

      const existing = await db
        .select({ id: submissions.id, publicId: submissions.publicId })
        .from(submissions)
        .where(
          and(
            eq(submissions.type, "intel"),
            sql`${submissions.payload}->>'headline' = ${headline}`,
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(submissions)
          .set({
            payload,
            status: "approved",
            publishedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(submissions.id, existing[0].id));
        return {
          ok: true,
          action: "updated" as const,
          publicId: existing[0].publicId,
          intelUrl: `/intel/${existing[0].publicId}`,
        };
      }

      const [row] = await db
        .insert(submissions)
        .values({
          type: "intel",
          status: "approved",
          payload,
          publishedAt: new Date(),
        })
        .returning({ publicId: submissions.publicId });

      return {
        ok: true,
        action: "inserted" as const,
        publicId: row.publicId,
        intelUrl: `/intel/${row.publicId}`,
      };
    },
  },
  {
    name: "rexintel_address_upsert",
    description:
      "Upsert an address with category/owner/USD/native fields. Dedupes on (chain, lower(address)). Optional linkTo argument attaches it to an existing intel headline as subject/counterparty/observed.",
    inputSchema: {
      type: "object",
      properties: {
        chain: {
          type: "string",
          description:
            "Chain slug (ethereum, bitcoin, solana, base, etc.).",
        },
        address: {
          type: "string",
          description: "Raw address string. Case preserved on insert.",
        },
        label: { type: "string" },
        notes: { type: "string" },
        category: {
          type: "string",
          enum: Array.from(VALID_ADDRESS_CATEGORIES),
        },
        ownerName: { type: "string" },
        balanceEstimateUsd: { type: "number" },
        nativeAmount: { type: "number" },
        nativeSymbol: { type: "string" },
        linkTo: {
          type: "object",
          properties: {
            headline: { type: "string" },
            role: { type: "string", enum: Array.from(VALID_INTEL_ROLES) },
          },
          required: ["headline", "role"],
          additionalProperties: false,
        },
      },
      required: ["chain", "address"],
      additionalProperties: false,
    },
    handler: async (args) => {
      const chainRaw = args.chain;
      const addressRaw = args.address;
      if (typeof chainRaw !== "string" || !chainRaw) {
        throw new Error("chain is required");
      }
      if (typeof addressRaw !== "string" || !addressRaw) {
        throw new Error("address is required");
      }
      const category = args.category as string | undefined;
      if (category && !VALID_ADDRESS_CATEGORIES.has(category)) {
        throw new Error(`invalid category: ${category}`);
      }

      const chain = chainRaw.toLowerCase().trim();

      const attrPatch: Record<string, unknown> = {};
      if (args.label !== undefined) attrPatch.label = args.label;
      if (args.notes !== undefined) attrPatch.notes = args.notes;
      if (category !== undefined) attrPatch.category = category;
      if (args.ownerName !== undefined) attrPatch.ownerName = args.ownerName;
      if (args.balanceEstimateUsd !== undefined)
        attrPatch.balanceEstimateUsd = String(args.balanceEstimateUsd);
      if (args.nativeAmount !== undefined)
        attrPatch.nativeAmount = String(args.nativeAmount);
      if (args.nativeSymbol !== undefined)
        attrPatch.nativeSymbol = String(args.nativeSymbol).toUpperCase();

      const [existing] = await db
        .select({ id: addresses.id })
        .from(addresses)
        .where(
          and(
            eq(addresses.chain, chain),
            sql`lower(${addresses.address}) = lower(${addressRaw})`,
          ),
        )
        .limit(1);

      let addressId: string;
      let action: "inserted" | "updated";
      if (existing) {
        await db
          .update(addresses)
          .set({ ...attrPatch, updatedAt: new Date() })
          .where(eq(addresses.id, existing.id));
        addressId = existing.id;
        action = "updated";
      } else {
        const [inserted] = await db
          .insert(addresses)
          .values({ chain, address: addressRaw, ...attrPatch })
          .returning({ id: addresses.id });
        addressId = inserted.id;
        action = "inserted";
      }

      let linkResult: {
        linked: boolean;
        submissionId?: string;
        headline?: string;
        role?: string;
        error?: string;
      } | null = null;

      const linkTo = args.linkTo as
        | { headline?: string; role?: string }
        | undefined;
      if (linkTo?.headline) {
        if (!linkTo.role || !VALID_INTEL_ROLES.has(linkTo.role)) {
          linkResult = {
            linked: false,
            error: "invalid_or_missing_role",
            headline: linkTo.headline,
          };
        } else {
          const [sub] = await db
            .select({ id: submissions.id })
            .from(submissions)
            .where(
              and(
                eq(submissions.type, "intel"),
                sql`${submissions.payload}->>'headline' = ${linkTo.headline}`,
              ),
            )
            .limit(1);
          if (!sub) {
            linkResult = {
              linked: false,
              error: "headline_not_found",
              headline: linkTo.headline,
            };
          } else {
            await db
              .insert(intelAddresses)
              .values({
                submissionId: sub.id,
                addressId,
                role: linkTo.role as "subject" | "counterparty" | "observed",
              })
              .onConflictDoNothing();
            linkResult = {
              linked: true,
              submissionId: sub.id,
              headline: linkTo.headline,
              role: linkTo.role,
            };
          }
        }
      }

      return {
        ok: true,
        action,
        addressId,
        chain,
        address: addressRaw,
        link: linkResult,
      };
    },
  },
];

const TOOL_INDEX = new Map(TOOLS.map((t) => [t.name, t]));

// ─── JSON-RPC dispatch ──────────────────────────────────────────────────

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
};

type JsonRpcResponse =
  | {
      jsonrpc: "2.0";
      id: string | number | null;
      result: unknown;
    }
  | {
      jsonrpc: "2.0";
      id: string | number | null;
      error: { code: number; message: string; data?: unknown };
    };

const RPC_ERR = {
  PARSE: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL: -32603,
};

function ok(id: JsonRpcRequest["id"], result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function fail(
  id: JsonRpcRequest["id"],
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code, message, data },
  };
}

/**
 * Dispatch a single JSON-RPC request. Notifications (no id) return null —
 * the route handler turns that into a 204.
 */
export async function dispatchMcp(
  req: JsonRpcRequest,
): Promise<JsonRpcResponse | null> {
  if (req.jsonrpc !== "2.0" || typeof req.method !== "string") {
    return fail(req.id ?? null, RPC_ERR.INVALID_REQUEST, "invalid request");
  }

  const isNotification = req.id === undefined || req.id === null;

  switch (req.method) {
    case "initialize":
      return ok(req.id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        capabilities: {
          tools: { listChanged: false },
        },
        instructions:
          "RexIntel operator surface. Call rexintel_context at the start of a session to know site state. Use rexintel_intel_upsert and rexintel_address_upsert to publish or attribute. Writes publish directly as approved — no curator queue for operator traffic.",
      });

    case "notifications/initialized":
    case "notifications/cancelled":
      return null;

    case "ping":
      return ok(req.id, {});

    case "tools/list":
      return ok(req.id, {
        tools: TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      });

    case "tools/call": {
      const params = req.params ?? {};
      const name = params.name as string | undefined;
      const args = (params.arguments as Record<string, unknown> | undefined) ?? {};
      if (!name || !TOOL_INDEX.has(name)) {
        return fail(
          req.id,
          RPC_ERR.METHOD_NOT_FOUND,
          `unknown tool: ${name ?? "(none)"}`,
        );
      }
      const tool = TOOL_INDEX.get(name)!;
      try {
        const result = await tool.handler(args);
        return ok(req.id, {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return ok(req.id, {
          content: [{ type: "text", text: `Error: ${message}` }],
          isError: true,
        });
      }
    }

    case "resources/list":
      return ok(req.id, { resources: [] });

    case "prompts/list":
      return ok(req.id, { prompts: [] });

    default:
      if (isNotification) return null;
      return fail(
        req.id,
        RPC_ERR.METHOD_NOT_FOUND,
        `method not found: ${req.method}`,
      );
  }
}

/**
 * Public surface for the admin page / docs. Returns the tool list without
 * the handlers attached — just name, description, and schema.
 */
export function listToolsPublic(): {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}[] {
  return TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  }));
}
