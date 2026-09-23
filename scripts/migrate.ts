import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, sqlClient } from "./db";

await sqlClient`CREATE EXTENSION IF NOT EXISTS citext`;
await migrate(db, { migrationsFolder: "src/db/migrations" });
console.log("migrations applied");
await sqlClient.end();
