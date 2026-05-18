/**
 * Run with: npx tsx scripts/create-admin.ts [email]
 *
 * Provisions (or refreshes) the `users` row for an operator email so
 * the FK targets used by review/award routes exist before that email
 * ever signs in. Authentication itself is Magic-Link OTP — there is
 * no password — but the allowlist is env-driven via OPERATOR_EMAILS
 * (defaulting to `rexintelservices@proton.me`).
 *
 * The script is optional: `findOrCreateOperatorUser` upserts on first
 * Magic-Link login too. Use this when you want the row to exist ahead
 * of time, e.g. to backfill content authored before the admin signed
 * in for the first time.
 */
import "dotenv/config";
import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { findOrCreateOperatorUser, isOperatorEmail } from "../src/lib/auth";

async function main() {
  let email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    const rl = readline.createInterface({ input: stdin, output: stdout });
    email = (await rl.question("Operator email: ")).trim().toLowerCase();
    rl.close();
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error("✕ Invalid email.");
    process.exit(1);
  }

  if (!isOperatorEmail(email)) {
    console.error(
      `✕ ${email} is not on the operator allowlist (OPERATOR_EMAILS).`,
    );
    console.error(
      "  Add it to your environment, e.g. OPERATOR_EMAILS=rexintelservices@proton.me,you@example.com",
    );
    process.exit(1);
  }

  const user = await findOrCreateOperatorUser(email);
  console.log(`✓ Operator row ready: ${user.email} (${user.id})`);
  console.log("  Sign in via /login — Magic Link will send the OTP.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
