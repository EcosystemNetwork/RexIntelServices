/**
 * Run with: npx tsx scripts/create-admin.ts
 *
 * Prompts for email + password, creates an admin user.
 */
import "dotenv/config";
import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import bcrypt from "bcryptjs";
import { db, users } from "../src/lib/db";

async function main() {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const email = (await rl.question("Email: ")).trim().toLowerCase();
  const password = await rl.question("Password (min 12 chars): ");
  rl.close();

  if (password.length < 12) {
    console.error("Password too short.");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const [user] = await db
    .insert(users)
    .values({ email, passwordHash })
    .onConflictDoUpdate({
      target: users.email,
      set: { passwordHash },
    })
    .returning();

  console.log(`✓ Admin user ready: ${user.email}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
