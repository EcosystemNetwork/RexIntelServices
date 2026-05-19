/**
 * Run with: npx tsx scripts/smoke-test-mcp.ts
 *
 * Smoke-tests the MCP route handler logic against the live Neon DB,
 * bypassing the Next dev server (which cannot load DATABASE_URL because
 * .env.local in this repo overrides .env with an empty value — pre-
 * existing config quirk, not relevant in prod).
 *
 * Imports the route's POST/GET handlers directly and calls them with
 * synthesized NextRequest objects, then asserts the JSON-RPC envelope
 * shape and that each tool actually executes against the DB.
 */
import { config } from "dotenv";
config({ path: ".env" }); // explicitly skip .env.local

import { NextRequest } from "next/server";
import { GET, POST } from "../src/app/api/mcp/route";

async function call(body: unknown): Promise<{ status: number; json: any }> {
  const req = new NextRequest("http://test.local/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "127.0.0.1" },
    body: JSON.stringify(body),
  });
  const res = await POST(req);
  // 204 = notification, empty body. Don't try to parse.
  if (res.status === 204) return { status: res.status, json: null };
  return { status: res.status, json: await res.json() };
}

function assert(cond: unknown, label: string) {
  if (!cond) {
    console.error(`✗ ${label}`);
    process.exit(1);
  }
  console.log(`✓ ${label}`);
}

async function main() {
  // -------------------- GET catalog --------------------
  const catalog = await GET();
  const catJson = await catalog.json();
  assert(catalog.status === 200, "GET /api/mcp returns 200");
  assert(catJson.name === "rexintel-forensic", "GET catalog identifies server");
  assert(Array.isArray(catJson.tools) && catJson.tools.length === 5, `GET catalog lists 5 tools (got ${catJson.tools?.length})`);

  // -------------------- initialize --------------------
  const init = await call({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "smoke", version: "1" } },
  });
  assert(init.status === 200, "initialize returns 200");
  assert(init.json.result?.protocolVersion === "2024-11-05", "initialize echoes protocolVersion");
  assert(init.json.result?.serverInfo?.name === "rexintel-forensic", "initialize returns serverInfo");

  // -------------------- ping --------------------
  const ping = await call({ jsonrpc: "2.0", id: 2, method: "ping" });
  assert(ping.json.result !== undefined && !ping.json.error, "ping returns empty result");

  // -------------------- tools/list --------------------
  const list = await call({ jsonrpc: "2.0", id: 3, method: "tools/list" });
  assert(Array.isArray(list.json.result?.tools), "tools/list returns array");
  const names: string[] = list.json.result.tools.map((t: any) => t.name);
  for (const expected of ["lookup_address", "search_intel", "fetch_neighborhood", "trace_outbound", "cite_external"]) {
    assert(names.includes(expected), `tools/list includes ${expected}`);
  }

  // -------------------- tools/call: search_intel (DB read) --------------------
  const search = await call({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: { name: "search_intel", arguments: { query: "lazarus", limit: 3 } },
  });
  assert(search.json.result?.content?.[0]?.type === "text", "search_intel returns text content");
  assert(search.json.result?.isError === false, "search_intel succeeds");
  const searchPayload = JSON.parse(search.json.result.content[0].text);
  assert(searchPayload.ok === true, "search_intel payload.ok === true");
  console.log(`   → ${searchPayload.count} intel rows matched 'lazarus'`);

  // -------------------- tools/call: cite_external (no DB) --------------------
  const cite = await call({
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: { name: "cite_external", arguments: { url: "https://example.com/x", claim: "test claim" } },
  });
  assert(cite.json.result?.isError === false, "cite_external succeeds");
  const citePayload = JSON.parse(cite.json.result.content[0].text);
  assert(citePayload.ok === true && citePayload.url === "https://example.com/x", "cite_external echoes url");

  // -------------------- tools/call: unknown tool --------------------
  const bad = await call({
    jsonrpc: "2.0",
    id: 6,
    method: "tools/call",
    params: { name: "definitely_not_a_tool", arguments: {} },
  });
  assert(bad.json.result?.isError === true, "unknown tool returns isError=true (not protocol error)");

  // -------------------- unknown method --------------------
  const badMethod = await call({ jsonrpc: "2.0", id: 7, method: "not/a/method" });
  assert(badMethod.json.error?.code === -32601, "unknown method returns -32601");

  // -------------------- batch --------------------
  const batch = await call([
    { jsonrpc: "2.0", id: "a", method: "ping" },
    { jsonrpc: "2.0", id: "b", method: "tools/list" },
  ]);
  assert(Array.isArray(batch.json) && batch.json.length === 2, `batch returns 2 responses (got ${Array.isArray(batch.json) ? batch.json.length : "non-array"})`);

  // -------------------- notification (no response body) --------------------
  const notif = await call({ jsonrpc: "2.0", method: "notifications/initialized" });
  // Notifications return 204 with no body — our `call` will attempt
  // json() and may produce {} or throw. The status is what we check.
  assert(notif.status === 204, "notifications return 204 No Content");

  console.log("\nAll MCP smoke tests passed.");
}

main().catch((e) => {
  console.error("smoke test failed:", e);
  process.exit(1);
});
