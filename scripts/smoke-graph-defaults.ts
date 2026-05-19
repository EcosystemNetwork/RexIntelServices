/**
 * Smoke test: call fetchGraphData with the new page defaults and confirm
 * the 5 freshly-backfilled originals (Despark / Pink Drainer / GitHub-key /
 * Telegram-BTC / OFAC Ronin) actually appear as nodes.
 */
import "dotenv/config";
import { fetchGraphData } from "@/lib/graph-data";

const EXPECTED_PUBLIC_IDS = [
  "8d6ffea02188c65b", // Despark drain (original, 9 addr)
  "c424f21fb6aa7a70", // Pink Drainer NFT (original, 5 addr)
  "84f809254722bed2", // GitHub key sweeper (original, 2 addr)
  "bc308f6f3c8d130b", // Telegram BTC drain (original, 2 addr)
  "3a1f5bf32eb5cb21", // OFAC Ronin (tip, 1 addr) — excluded by kind=all
];

async function main() {
  const data = await fetchGraphData({
    window: "90",
    kind: "all",
    view: "incidents",
  });

  console.log(
    `Default view yields ${data.meta.nodeCount} nodes (${data.meta.incidentCount} incident · ${data.meta.addressCount} address) ${data.meta.edgeCount} edges.`,
  );

  const incidentPublicIds = new Set(
    data.nodes
      .filter((n): n is typeof n & { kind: "incident" } => n.kind === "incident")
      .map((n) => n.publicId),
  );

  for (const pid of EXPECTED_PUBLIC_IDS) {
    const shown = incidentPublicIds.has(pid);
    console.log(`  ${shown ? "✓" : "✗"} ${pid}${shown ? "" : "   ← NOT in default view"}`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("[smoke] fatal:", err);
  process.exit(1);
});
