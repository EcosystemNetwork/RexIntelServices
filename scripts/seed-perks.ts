/**
 * Run with: npx tsx scripts/seed-perks.ts
 *
 * Seeds /intel?lane=perks — vendor + infra perks programs: credits,
 * cloud allocations, builder discounts. Distinct from grants
 * (non-dilutive cash) and capital (equity) — the value is in-kind:
 * credits, free tier extensions, services.
 *
 * Curation rule: real programs from named vendors with a public
 * application or signup. Skip "talk to sales" pages dressed up as
 * perks — that's a sales funnel, not a perk.
 *
 * Idempotent: matched by payload->>'name'.
 */
import "dotenv/config";
import { and, eq, sql } from "drizzle-orm";
import { db, submissions } from "../src/lib/db";
import type { PerksPayload } from "../src/lib/db/schema";

const perks: PerksPayload[] = [
  {
    name: "Alchemy Solana $20M Fund",
    organization: "Alchemy",
    organizationUrl: "https://www.alchemy.com/solana-20m-fund",
    description:
      "$20M credits program for Solana builders, run by Alchemy in partnership with Superteam, the Solana Foundation, and Monke Foundry. Teams can claim up to $25k in Alchemy credits to evaluate the infrastructure over a 90-day window. No lock-in, no proprietary APIs, and responses arrive within five business days of application. Aimed at teams shipping on Solana — early-stage, scaling, or already in production.",
    value: "Up to $25k in credits",
    category: "Infra · RPC",
    ecosystem: "Solana",
    eligibility:
      "Teams building on Solana. Application asks for project website, contact info, and current infrastructure provider.",
    applyUrl: "https://www.alchemy.com/solana-20m-fund",
    rolling: true,
    tags: ["solana", "credits", "rpc", "infra"],
  },
];

async function upsert(payload: PerksPayload) {
  const existing = await db
    .select({ id: submissions.id, publicId: submissions.publicId })
    .from(submissions)
    .where(
      and(
        eq(submissions.type, "perks"),
        sql`${submissions.payload}->>'name' = ${payload.name}`,
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    const [row] = await db
      .update(submissions)
      .set({
        payload,
        status: "approved",
        publishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(submissions.id, existing[0].id))
      .returning({ publicId: submissions.publicId });
    return { action: "updated" as const, publicId: row.publicId };
  }
  const [row] = await db
    .insert(submissions)
    .values({
      type: "perks",
      status: "approved",
      payload,
      publishedAt: new Date(),
    })
    .returning({ publicId: submissions.publicId });
  return { action: "inserted" as const, publicId: row.publicId };
}

async function main() {
  let inserted = 0;
  let updated = 0;
  for (const p of perks) {
    const r = await upsert(p);
    if (r.action === "inserted") inserted++;
    else updated++;
    console.log(`  ${r.action.padEnd(8)} /perks/${r.publicId}  ${p.name}`);
  }
  console.log(
    `\n✓ ${perks.length} perks processed (${inserted} new, ${updated} updated).`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
