// DB handle for CLI scripts (no "server-only" guard).
import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";

export const sqlClient = postgres(process.env.DATABASE_URL!, { max: 4, onnotice: () => {} });
export const db = drizzle(sqlClient, { schema });
