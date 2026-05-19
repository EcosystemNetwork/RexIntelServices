/**
 * Run with: npx tsx scripts/run-forensic-agent.ts [target] [targetKind]
 *
 * Fires the RexIntel ForensicAgent directly (bypasses the API route and
 * the dev server) against a target. Inserts a forensic_cases row, runs
 * the Gemini Pro function-calling loop, and prints the structured report
 * + a transcript summary.
 *
 * Defaults to the Bybit-hack Lazarus destination address (Feb 2025), which
 * is well-curated in the RexIntel graph + intel corpus, so the demo
 * exercises every tool and produces a substantive report.
 *
 * Examples:
 *   npx tsx scripts/run-forensic-agent.ts
 *   npx tsx scripts/run-forensic-agent.ts 0x12D66f87A04A9E220743712cE6d9bB1B5616B8Fc
 *   npx tsx scripts/run-forensic-agent.ts "Lazarus Group recent activity" question
 */
import { config } from "dotenv";
config({ path: ".env" }); // explicitly skip .env.local (empty DATABASE_URL there)

import { eq } from "drizzle-orm";
import { db, forensicCases } from "../src/lib/db";
import { runForensicAgent } from "../src/lib/forensic/agent";
import type { ForensicReport, ForensicTranscriptStep } from "../src/lib/db/schema";

const DEFAULT_TARGET = "0x47666Fab8bd0Ac7003bce3f5C3585383F09486E2";
const DEFAULT_KIND = "address";

function dim(s: string): string {
  return `\x1b[2m${s}\x1b[0m`;
}
function bold(s: string): string {
  return `\x1b[1m${s}\x1b[0m`;
}
function cyan(s: string): string {
  return `\x1b[36m${s}\x1b[0m`;
}
function yellow(s: string): string {
  return `\x1b[33m${s}\x1b[0m`;
}
function red(s: string): string {
  return `\x1b[31m${s}\x1b[0m`;
}
function green(s: string): string {
  return `\x1b[32m${s}\x1b[0m`;
}

function verdictColor(v: string): string {
  switch (v) {
    case "malicious":
      return red(v);
    case "suspicious":
      return yellow(v);
    case "clean":
      return green(v);
    default:
      return dim(v);
  }
}

async function main() {
  const target = process.argv[2] ?? DEFAULT_TARGET;
  const targetKind = (process.argv[3] ?? DEFAULT_KIND) as
    | "address"
    | "url"
    | "intel"
    | "question";
  const chain = targetKind === "address" ? "ethereum" : null;

  console.log(`\n${bold("RexIntel ForensicAgent")} ${dim("· direct CLI runner")}`);
  console.log(`${dim("target_kind:")} ${targetKind}`);
  console.log(`${dim("target:     ")} ${target}`);
  if (chain) console.log(`${dim("chain:      ")} ${chain}`);
  console.log();

  const t0 = Date.now();

  // Insert the case row.
  const [inserted] = await db
    .insert(forensicCases)
    .values({
      targetKind,
      target,
      chain,
      submitterEmail: "cli-runner@rexintel.internal",
      submitterIp: "cli",
    })
    .returning({ id: forensicCases.id, publicId: forensicCases.publicId });
  if (!inserted) throw new Error("failed to insert forensic case row");
  console.log(`${dim("→ case_id:    ")} ${inserted.publicId}`);
  console.log(`${dim("→ public url: ")} /forensic/${inserted.publicId}`);
  console.log(`\n${cyan("running agent…")} ${dim("(Gemini 2.5 Pro function-calling loop)")}\n`);

  await runForensicAgent({ caseId: inserted.id });

  // Reload to get final state.
  const [final] = await db
    .select()
    .from(forensicCases)
    .where(eq(forensicCases.id, inserted.id))
    .limit(1);
  if (!final) throw new Error("case row vanished after agent run");

  const elapsedSec = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(
    `${dim("agent finished in")} ${elapsedSec}s ${dim("·")} ${dim("status:")} ${
      final.status === "complete" ? green(final.status) : final.status === "failed" ? red(final.status) : dim(final.status)
    } ${dim("·")} ${dim("iterations:")} ${final.iterationsUsed}/${final.maxIterations} ${dim("·")} ${dim("tool calls:")} ${final.toolCallCount}\n`,
  );

  // -------------------- Report --------------------
  const report = final.report as ForensicReport | null;
  if (report) {
    console.log(bold("─── REPORT ─────────────────────────────────────────────"));
    console.log(
      `${dim("verdict:")}    ${verdictColor(report.verdict)}   ${dim("confidence:")} ${Math.round(report.confidence * 100)}%`,
    );
    if (report.attributedTo) {
      console.log(`${dim("attributed to:")} ${bold(report.attributedTo)}`);
    }
    console.log(`\n${bold("summary")}\n${report.summary}\n`);

    if (report.fundsFlow.length > 0) {
      console.log(bold("funds flow"));
      for (const f of report.fundsFlow) {
        const amt = f.amountUsd ? ` $${f.amountUsd.toLocaleString()}` : "";
        const via = f.via ? ` via ${f.via}` : "";
        console.log(`  ${f.from} → ${f.to}${via}${amt}`);
        if (f.note) console.log(`    ${dim(f.note)}`);
      }
      console.log();
    }

    if (report.citations.length > 0) {
      console.log(bold(`citations (${report.citations.length})`));
      for (const c of report.citations) {
        console.log(`  ${dim("[" + c.kind + "]")} ${c.ref}`);
        console.log(`    ${c.claim}`);
      }
      console.log();
    }

    if (report.timeline.length > 0) {
      console.log(bold("timeline"));
      for (const t of report.timeline) {
        console.log(`  ${dim(t.at ?? "—")}  ${t.event}`);
      }
      console.log();
    }

    if (report.recommendedActions.length > 0) {
      console.log(bold("recommended actions"));
      for (const a of report.recommendedActions) console.log(`  • ${a}`);
      console.log();
    }
  } else {
    console.log(red("no final report"));
    if (final.failureReason) console.log(red(`reason: ${final.failureReason}`));
  }

  // -------------------- Transcript summary --------------------
  const transcript = (final.transcript ?? []) as ForensicTranscriptStep[];
  console.log(bold("─── TRANSCRIPT ─────────────────────────────────────────"));
  for (let i = 0; i < transcript.length; i++) {
    const s = transcript[i];
    const n = String(i + 1).padStart(2, "0");
    if (s.kind === "user_prompt") {
      console.log(`${dim(n)} ${dim("user_prompt")}`);
    } else if (s.kind === "thought") {
      console.log(`${dim(n)} ${cyan("thought")}: ${s.text.slice(0, 120)}${s.text.length > 120 ? "…" : ""}`);
    } else if (s.kind === "tool_call") {
      const ms = s.ms != null ? ` (${s.ms < 1000 ? s.ms + "ms" : (s.ms / 1000).toFixed(1) + "s"})` : "";
      const err = s.error ? red(" ✗ " + s.error) : "";
      const argsStr = JSON.stringify(s.args).slice(0, 80);
      console.log(`${dim(n)} ${yellow("tool_call")} ${bold(s.name)}${dim(ms)} ${dim(argsStr)}${err}`);
    } else if (s.kind === "final") {
      console.log(`${dim(n)} ${green("final")}`);
    }
  }

  console.log(`\n${dim("Done. View the case at /forensic/" + final.publicId)}`);
  process.exit(0);
}

main().catch((e) => {
  console.error("\n\x1b[31mERROR:\x1b[0m", e);
  process.exit(1);
});
