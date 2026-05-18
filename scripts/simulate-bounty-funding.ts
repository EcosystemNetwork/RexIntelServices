/**
 * scripts/simulate-bounty-funding.ts
 *
 * Local dev / smoke-test tool. Skips Circle entirely and forces a bounty
 * through the funding state-machine so the rest of the flow (claims,
 * adjudication, payout dry-run) can be exercised end-to-end against the
 * live DB.
 *
 * What it does:
 *   1. Looks up a bounty by publicId.
 *   2. Bumps escrowedAmountUsdc by the requested amount.
 *   3. Stamps victim_verified_at = now() if not already verified.
 *   4. Flips status → 'open' (mimics what the Circle webhook would do
 *      once the escrow funding lands AND victim verification is in).
 *
 * Run:
 *   npx tsx scripts/simulate-bounty-funding.ts <bountyPublicId> [amountUsdc]
 *
 * Safety: refuses to operate on a bounty that already has a circle_wallet_id
 * set, since that means real escrow is wired and a fake bump would
 * desynchronize the on-chain reality from the DB.
 */
import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { db, bounties } from "../src/lib/db";

async function main() {
  const [, , publicId, amountArg] = process.argv;
  if (!publicId) {
    console.error("usage: tsx scripts/simulate-bounty-funding.ts <publicId> [amountUsdc]");
    process.exit(1);
  }
  const amount = Number(amountArg ?? "100");
  if (!Number.isFinite(amount) || amount <= 0) {
    console.error(`Invalid amount: ${amountArg}`);
    process.exit(1);
  }

  const [bounty] = await db
    .select()
    .from(bounties)
    .where(eq(bounties.publicId, publicId))
    .limit(1);
  if (!bounty) {
    console.error(`No bounty with publicId=${publicId}`);
    process.exit(1);
  }

  if (bounty.circleWalletId) {
    console.error(
      `Bounty ${publicId} has a real Circle wallet (${bounty.circleWalletId}).\n` +
        `Refusing to simulate funding — let the real Circle webhook handle it.\n` +
        `If you really need to override, set FORCE=1 and re-run.`,
    );
    if (process.env.FORCE !== "1") process.exit(1);
  }

  if (bounty.status !== "draft" && bounty.status !== "funded") {
    console.error(
      `Bounty ${publicId} is in status=${bounty.status}; only draft/funded can be force-opened.`,
    );
    process.exit(1);
  }

  console.log(`Bounty ${publicId}:`);
  console.log(`  kind          : ${bounty.kind}`);
  console.log(`  prev status   : ${bounty.status}`);
  console.log(`  prev escrow   : $${Number(bounty.escrowedAmountUsdc).toFixed(2)}`);
  console.log(`  prev verified : ${bounty.victimVerifiedAt ? "yes" : "no"}`);

  const newEscrowed = Number(bounty.escrowedAmountUsdc ?? "0") + amount;
  const verifiedAt = bounty.victimVerifiedAt ?? new Date();

  await db
    .update(bounties)
    .set({
      escrowedAmountUsdc: sql`${bounties.escrowedAmountUsdc} + ${amount.toFixed(2)}`,
      victimVerifiedAt: verifiedAt,
      fundingTxHash: bounty.fundingTxHash ?? "simulated-funding",
      status: "open",
      updatedAt: new Date(),
    })
    .where(eq(bounties.id, bounty.id));

  console.log(`✓ Forced bounty ${publicId} → open`);
  console.log(`  new escrow    : $${newEscrowed.toFixed(2)}`);
  console.log(`  new verified  : ${verifiedAt.toISOString()}`);
  console.log("");
  console.log(`Next: claim it from a trusted-tier Circle session, then adjudicate at /admin/bounty-claims.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
