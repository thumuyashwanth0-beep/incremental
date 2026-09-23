import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

// Reuse one pool across hot reloads in dev.
const g = globalThis as unknown as { __pg?: ReturnType<typeof postgres> };
const client = (g.__pg ??= postgres(env().DATABASE_URL, { max: 10 }));

export const db = drizzle(client, { schema });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
