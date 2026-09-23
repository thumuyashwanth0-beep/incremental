# src/db: Drizzle schema and migrations

- `schema.ts` is the source of truth. Change it, then `npm run db:generate`, review the SQL in `migrations/`, then `npm run db:migrate`.
- Never edit an applied or committed migration. Never use `drizzle-kit push` (it's denied in settings).
- `client.ts` is server-only (`import "server-only"`). CLI scripts use `scripts/db.ts`.
- User-owned tables (`attempts`, `topic_mastery`, `review_items`, `practice_sessions`, `ai_usage`, `question_reports`)
  cascade on user delete. That's required for account deletion (DPDP).
- Workflow: `/db-change`.
