import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// In Node.js runtimes (e.g. `next dev`, Vercel Node functions) there is no
// native WebSocket, so we polyfill with `ws`. In Edge runtime / browsers the
// native global is used and this branch is skipped.
if (typeof globalThis.WebSocket === "undefined") {
  neonConfig.webSocketConstructor = require("ws");
}

const pool = new Pool({ connectionString });

export const db = drizzle(pool, { schema });

export * from "./schema";
