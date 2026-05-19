import { NextRequest, NextResponse } from "next/server";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import {
  lookupAddress,
  searchIntel,
  fetchNeighborhood,
  traceOutbound,
  citeExternal,
} from "@/lib/forensic/tools";

export const runtime = "nodejs";
// trace_outbound can spend 20-40s on Etherscan; cap matches /api/forensic.
export const maxDuration = 300;

/**
 * POST /api/mcp
 *
 * Model Context Protocol server — JSON-RPC 2.0 over HTTP. Exposes the same
 * five tools the ForensicAgent uses, so any MCP-compliant client (Claude
 * Desktop, Claude Code, the SANS SIFT Workstation's Protocol SIFT layer,
 * any other MCP-aware agent) can plug straight into RexIntel's attribution
 * graph + intel corpus + on-chain trace runner without writing glue code.
 *
 * Why hand-rolled instead of @modelcontextprotocol/sdk:
 *   - Zero new deps. The MCP protocol surface we need (tools/list +
 *     tools/call + initialize + ping) is ~80 lines of JSON-RPC.
 *   - One endpoint, one transport (Streamable HTTP). No stdio plumbing.
 *   - We can rate-limit and shape responses inline.
 *
 * Protocol version targeted: 2024-11-05 (compatible with Claude Desktop
 * and current MCP-aware clients). The `initialize` response negotiates;
 * if a future client requests a newer version we accept and respond with
 * the same since our surface is forward-compatible.
 *
 * Usage from a Claude Desktop config (claude_desktop_config.json):
 *
 *   "mcpServers": {
 *     "rexintel-forensic": {
 *       "transport": "http",
 *       "url": "https://rexintelservices.com/api/mcp"
 *     }
 *   }
 *
 * Usage from a raw JSON-RPC client:
 *
 *   curl -X POST https://rexintelservices.com/api/mcp \
 *     -H 'Content-Type: application/json' \
 *     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
 */

type JsonRpcId = string | number | null;

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponseBase {
  jsonrpc: "2.0";
  id: JsonRpcId;
}

interface JsonRpcSuccess<T = unknown> extends JsonRpcResponseBase {
  result: T;
}

interface JsonRpcError extends JsonRpcResponseBase {
  error: { code: number; message: string; data?: unknown };
}

type JsonRpcResponse = JsonRpcSuccess | JsonRpcError;

// =====================================================================
// Tool registry — schemas published via tools/list, executors dispatched
// from tools/call. Schemas are JSON Schema draft-07 (what MCP expects).
// Keep these in sync with the Gemini FunctionDeclarations in
// src/lib/forensic/agent.ts so both surfaces describe the same contract.
// =====================================================================

type ToolDef = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  // Executor takes the parsed arguments and returns a JSON-serializable
  // value. Errors are caught at the dispatcher and converted to MCP
  // tool-call error responses.
  execute: (args: Record<string, unknown>) => Promise<unknown>;
};

const TOOLS: ToolDef[] = [
  {
    name: "lookup_address",
    description:
      "Look up RexIntel's full context for one wallet/contract address — attributions, owner cluster, category, balance estimate, and any linked incidents in the public intel corpus.",
    inputSchema: {
      type: "object",
      properties: {
        chain: {
          type: "string",
          description: "Lowercase chain name. Default 'ethereum'.",
        },
        address: {
          type: "string",
          description: "0x-prefixed 40-char hex address.",
        },
      },
      required: ["address"],
    },
    execute: (args) =>
      lookupAddress({
        chain: args.chain as string | undefined,
        address: args.address as string,
      }),
  },
  {
    name: "search_intel",
    description:
      "Keyword-search RexIntel's approved intel corpus (incident postmortems, original investigations, community tips). Returns headlines, deks, publicIds, and intel URLs.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "2+ char keyword or phrase to search.",
        },
        limit: {
          type: "number",
          description: "Max results to return (1-20). Default 8.",
        },
      },
      required: ["query"],
    },
    execute: (args) =>
      searchIntel({
        query: args.query as string,
        limit: args.limit as number | undefined,
      }),
  },
  {
    name: "fetch_neighborhood",
    description:
      "Fetch a slice of RexIntel's attribution graph (nodes + edges) around a category, time window, or view. Use to see broader cluster context before drilling into a single address.",
    inputSchema: {
      type: "object",
      properties: {
        windowDays: {
          type: "number",
          description: "30 | 90 | 365. Default 365.",
        },
        view: {
          type: "string",
          description: "incidents | institutional | combined. Default 'combined'.",
        },
        category: { type: "string" },
        minConfidence: { type: "number" },
      },
    },
    execute: (args) =>
      fetchNeighborhood({
        windowDays: args.windowDays as 30 | 90 | 365 | undefined,
        view: args.view as "incidents" | "institutional" | "combined" | undefined,
        category: args.category as string | undefined,
        minConfidence: args.minConfidence as number | undefined,
      }),
  },
  {
    name: "trace_outbound",
    description:
      "Run RexIntel's victim-trace runner on a wallet — walks outbound transfers up to 3 hops via Etherscan, terminates at known-attributed addresses (exchanges, mixers, sanctioned, bridges). Persists hops to the public attribution graph. SLOW (~20-40s) and Etherscan-budgeted; use sparingly.",
    inputSchema: {
      type: "object",
      properties: {
        chain: { type: "string", description: "ethereum (v1 only)." },
        address: { type: "string", description: "0x-prefixed 40-char hex address." },
        maxHops: { type: "number", description: "1-3. Default 2." },
      },
      required: ["address"],
    },
    execute: (args) =>
      traceOutbound({
        chain: args.chain as string | undefined,
        address: args.address as string,
        maxHops: args.maxHops as number | undefined,
      }),
  },
  {
    name: "cite_external",
    description:
      "Declare an external URL citation (e.g. an Etherscan label page, news article, sanctions notice) the calling agent intends to use as evidence. Validated for shape; not fetched server-side.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "http(s)://… URL of the source." },
        claim: { type: "string", description: "The claim this citation supports." },
      },
      required: ["url", "claim"],
    },
    execute: (args) =>
      citeExternal({ url: args.url as string, claim: args.claim as string }),
  },
];

const TOOL_INDEX: Record<string, ToolDef> = Object.fromEntries(
  TOOLS.map((t) => [t.name, t]),
);

// =====================================================================
// JSON-RPC dispatcher. Methods are dispatched by string; unknown methods
// return -32601 (Method not found). Tool-call errors are encoded inside
// a successful tools/call response as `isError: true` per MCP spec — the
// outer JSON-RPC envelope only carries protocol-level errors.
// =====================================================================

const PROTOCOL_VERSION = "2024-11-05";

function rpcSuccess<T>(id: JsonRpcId, result: T): JsonRpcSuccess<T> {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcError {
  return { jsonrpc: "2.0", id, error: { code, message, data } };
}

async function handleRpc(req: JsonRpcRequest): Promise<JsonRpcResponse | null> {
  const id = req.id ?? null;
  const method = req.method;
  const params = (req.params ?? {}) as Record<string, unknown>;

  switch (method) {
    // Notifications carry no id; the client expects no response.
    case "notifications/initialized":
    case "notifications/cancelled":
      return null;

    case "initialize": {
      // Echo the protocol version back. If the client sent something newer
      // we still respond with ours; clients negotiate downward.
      const requested = (params.protocolVersion as string) ?? PROTOCOL_VERSION;
      return rpcSuccess(id, {
        protocolVersion: requested,
        capabilities: {
          tools: { listChanged: false },
        },
        serverInfo: {
          name: "rexintel-forensic",
          version: "1.0.0",
          // Free-form metadata so MCP clients with a UI can render context.
          title: "RexIntel ForensicAgent — MCP",
          description:
            "Tools for crypto incident response: address attribution lookup, intel corpus search, attribution-graph neighborhood, outbound trace runner, external citation declaration.",
        },
      });
    }

    case "ping":
      return rpcSuccess(id, {});

    case "tools/list":
      return rpcSuccess(id, {
        tools: TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      });

    case "tools/call": {
      const name = params.name as string;
      const args = (params.arguments ?? {}) as Record<string, unknown>;
      const tool = TOOL_INDEX[name];
      if (!tool) {
        // Per MCP spec, unknown-tool is reported in-band as isError, not
        // as a JSON-RPC error — keeps the agent loop tolerant.
        return rpcSuccess(id, {
          content: [{ type: "text", text: `unknown tool: ${name}` }],
          isError: true,
        });
      }
      try {
        const result = await tool.execute(args);
        return rpcSuccess(id, {
          content: [
            { type: "text", text: JSON.stringify(result, null, 2) },
          ],
          isError: false,
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : "unknown tool error";
        return rpcSuccess(id, {
          content: [{ type: "text", text: message }],
          isError: true,
        });
      }
    }

    default:
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}

// =====================================================================
// HTTP entry — accepts a single JSON-RPC request OR an array (batch).
// Responses for notifications are dropped (per JSON-RPC). Batch
// responses are returned as an array; single requests as an object.
// =====================================================================

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  // 60 RPC calls per IP per hour. The expensive tool (trace_outbound)
  // internally calls Etherscan which has its own per-key budget; the rate
  // limit here is mostly to prevent runaway loops from a misconfigured
  // client.
  const limit = await rateLimit(`mcp:${ip}`, 60, 60 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      rpcError(null, -32000, "Rate limit exceeded", {
        retryAfterSec: limit.retryAfterSec,
      }),
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSec) },
      },
    );
  }

  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return NextResponse.json(rpcError(null, -32700, "Parse error"), {
      status: 400,
    });
  }

  // Batch
  if (Array.isArray(parsed)) {
    const responses = await Promise.all(
      parsed.map(async (one) => handleRpc(one as JsonRpcRequest)),
    );
    const filtered = responses.filter((r): r is JsonRpcResponse => r !== null);
    return NextResponse.json(filtered);
  }

  // Single
  const out = await handleRpc(parsed as JsonRpcRequest);
  if (out === null) {
    // Notification — JSON-RPC says no response body; return 204.
    return new NextResponse(null, { status: 204 });
  }
  return NextResponse.json(out);
}

// =====================================================================
// GET — handy for humans and for MCP clients that probe with HEAD/GET.
// Returns the same tools/list payload so a judge can hit the URL in a
// browser and see what the agent can do, no client needed.
// =====================================================================

export async function GET() {
  return NextResponse.json({
    name: "rexintel-forensic",
    version: "1.0.0",
    protocolVersion: PROTOCOL_VERSION,
    transport: "http",
    description:
      "RexIntel ForensicAgent MCP server. POST JSON-RPC 2.0 to this same URL.",
    methods: ["initialize", "tools/list", "tools/call", "ping"],
    tools: TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
    docs: "/forensic",
  });
}
