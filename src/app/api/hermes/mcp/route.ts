import { NextResponse } from "next/server";
import { dispatchMcp } from "@/lib/hermes-mcp";
import { isHermesAuthorized } from "@/lib/hermes-auth";

/**
 * POST /api/hermes/mcp
 *
 * Streamable HTTP transport for the RexIntel MCP server. Hermes (and any
 * other MCP client) sends JSON-RPC 2.0 requests here with
 *   Authorization: Bearer $HERMES_OPERATOR_TOKEN
 *
 * Single-request shape: { jsonrpc, id, method, params } → returns the
 * matching JSON-RPC response.
 * Batch shape: an array of requests → returns an array of responses.
 * Notifications (no `id`) return 204 with no body.
 *
 * The classic /api/hermes/* REST routes are unaffected and remain live
 * for callers that don't speak MCP.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isHermesAuthorized(req)) {
    // Per MCP spec the server SHOULD return 401 for missing/invalid auth so
    // the client knows to surface a credential error rather than treating
    // it as a tool failure.
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32001, message: "unauthorized" } },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "parse error" },
      },
      { status: 400 },
    );
  }

  if (Array.isArray(body)) {
    const responses = await Promise.all(
      body.map((r) => dispatchMcp(r as Parameters<typeof dispatchMcp>[0])),
    );
    const filtered = responses.filter((r) => r !== null);
    if (filtered.length === 0) {
      return new NextResponse(null, { status: 204 });
    }
    return NextResponse.json(filtered);
  }

  const result = await dispatchMcp(body as Parameters<typeof dispatchMcp>[0]);
  if (result === null) {
    return new NextResponse(null, { status: 204 });
  }
  return NextResponse.json(result);
}

/**
 * GET is intentionally unsupported — Streamable HTTP allows server-initiated
 * messages via GET-SSE, but every tool here is request/response so we don't
 * open that channel. A bare GET helps humans discover the endpoint exists.
 */
export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      error: "method_not_allowed",
      hint: "POST JSON-RPC 2.0 requests to this endpoint. See /hermes admin page.",
    },
    { status: 405 },
  );
}
