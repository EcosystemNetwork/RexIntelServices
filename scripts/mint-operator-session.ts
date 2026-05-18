/**
 * One-shot helper: provisions the operator users row for the supplied
 * email and prints a sealed `newsletter_session` cookie value to stdout.
 * Used only for local end-to-end testing — skips the real Magic OTP
 * round-trip so curl / a headless browser can exercise admin pages.
 *
 *   npx tsx scripts/mint-operator-session.ts rexintelservices@proton.me
 */
import "dotenv/config";
import { sealData } from "iron-session";
import { findOrCreateOperatorUser, isOperatorEmail } from "../src/lib/auth";

async function main() {
  const email = (process.argv[2] ?? "rexintelservices@proton.me").trim().toLowerCase();
  if (!isOperatorEmail(email)) {
    console.error(`✕ ${email} not in OPERATOR_EMAILS allowlist`);
    process.exit(1);
  }
  const user = await findOrCreateOperatorUser(email);
  const pw = process.env.SESSION_PASSWORD;
  if (!pw || pw.length < 32) {
    console.error("✕ SESSION_PASSWORD missing or too short");
    process.exit(1);
  }
  const sealed = await sealData(
    { userId: user.id, email: user.email },
    { password: pw },
  );
  process.stdout.write(sealed);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
