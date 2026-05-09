import "dotenv/config";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const r = await pool.query(
    "SELECT email, first_name, status, ip_address, created_at FROM subscribers ORDER BY created_at DESC",
  );
  console.log(`subscribers (${r.rows.length}):`);
  for (const row of r.rows) console.log(" ", row);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
