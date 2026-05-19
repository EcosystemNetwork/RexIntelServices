import "dotenv/config";
import { and, eq, sql } from "drizzle-orm";
import { db, submissions } from "../src/lib/db";

async function main() {
  const target = process.argv[2] ?? "Garantex";
  const rows = await db
    .select({
      payload: submissions.payload,
    })
    .from(submissions)
    .where(
      and(
        eq(submissions.type, "intel"),
        eq(submissions.status, "approved"),
        sql`${submissions.payload}->>'headline' ILIKE ${"%" + target + "%"}`,
      ),
    )
    .limit(3);

  for (const r of rows) {
    const p = r.payload as { headline: string; dek?: string; body?: string; lossUsd?: number };
    console.log("HEADLINE:", p.headline);
    console.log("DEK:", p.dek?.slice(0, 200));
    console.log("BODY[0]:", (p.body ?? "").split("\n\n")[0].slice(0, 400));
    console.log("LOSS USD:", p.lossUsd);
    console.log("---");
  }
  process.exit(0);
}
main();
