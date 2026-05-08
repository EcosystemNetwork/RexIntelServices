import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// Use a single connection for serverless / edge friendliness.
// For self-hosted Node servers, you can raise `max` for a real pool.
const client = postgres(connectionString, {
  max: process.env.NODE_ENV === "production" ? 10 : 1,
  prepare: false, // required for transaction pooling (e.g. Supabase pgbouncer)
});

export const db = drizzle(client, { schema });

export * from "./schema";
