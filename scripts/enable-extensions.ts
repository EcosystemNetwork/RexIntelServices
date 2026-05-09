import "dotenv/config";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const r = await pool.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
  console.log("pgcrypto:", r.command || "ok");
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
