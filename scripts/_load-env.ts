// Env preloader for tsx scripts. Import this BEFORE any module that reads
// process.env at load time (e.g. ../src/lib/db). ESM hoists imports in source
// order, so as long as this is the first import the merge runs first.
//
// Merge rules — both layers contribute, non-empty values win:
//   1. .env       — base, often the dev DB URL committed to your workstation
//   2. .env.local — Vercel-pulled secrets (RESEND_API_KEY, etc.)
//
// We can't just override blindly because `vercel env pull` writes empty strings
// for Neon-integration vars like DATABASE_URL, which would clobber the real
// .env value.
import { config as dotenvConfig, parse as dotenvParse } from "dotenv";
import { readFileSync, existsSync } from "fs";

dotenvConfig({ path: ".env" });

if (existsSync(".env.local")) {
  const parsed = dotenvParse(readFileSync(".env.local"));
  for (const [k, v] of Object.entries(parsed)) {
    if (typeof v === "string" && v.length > 0) process.env[k] = v;
  }
}
