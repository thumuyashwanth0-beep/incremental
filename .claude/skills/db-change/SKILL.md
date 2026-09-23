---
name: db-change
description: Safely change the Postgres schema (Drizzle) including migration generation, review and data backfill. Use for any change to src/db/schema.ts, new tables, columns or indexes.
---

# Database change

1. Edit `src/db/schema.ts`. Conventions: `snake_case` columns, `uuid` PKs with `defaultRandom()`
   (topics/units/misconceptions use their syllabus string IDs), `timestamp(..., {withTimezone: true})`,
   FKs with explicit `onDelete`, an index for every FK and hot filter.
2. `npm run db:generate` → inspect the new SQL in `src/db/migrations/`. Check for:
   - destructive ops (DROP, type narrowing): need an explicit user OK plus a backfill plan
   - `NOT NULL` on existing tables: add as nullable → backfill → set NOT NULL in a later migration
   - large-table indexes: prefer `CREATE INDEX CONCURRENTLY` (hand-edit, separate migration)
3. `npm run db:migrate` on the local DB, then `npm test`.
4. Never edit a migration that has been applied or committed. Write a new one.
5. Never use `drizzle-kit push` (it's denied). Migrations only.
6. Update `docs/ARCHITECTURE.md` (data model section) if tables change.
