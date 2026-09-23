@AGENTS.md

# JEE Prep Coach

A JEE Main practice app. Students answer MCQ and numerical questions. The app works out *why* a
student went wrong (misconception-tagged distractors, behaviour signals, AI analysis of the
student's working), tracks mastery per syllabus topic, and picks what to practise next.

**Read before non-trivial work:**

| Doc | Read it when you are touching… |
|---|---|
| `docs/PRODUCT.md` | features, UX, priorities (P0/P1/P2) |
| `docs/ARCHITECTURE.md` | layout, stack, request flow, layering rules |
| `docs/DATA_STRATEGY.md` | questions, sources/licensing, pipeline, coverage targets |
| `docs/LEARNING_ENGINE.md` | diagnosis, mastery, adaptive selection, spaced review |
| `docs/SECURITY.md` | auth, anything user-facing, AI prompts, new endpoints |
| `docs/API.md` | HTTP endpoints and payloads |
| `docs/ROADMAP.md` | what's done and what's next. **Update it when you finish an item.** |

## Commands

```bash
docker compose up -d db          # Postgres 16 on :5432
cp .env.example .env             # first time only; then fill values
npm run db:migrate               # apply drizzle migrations
npm run content:import           # syllabus + misconceptions + questions → DB (idempotent)
npm run dev                      # http://localhost:3000

npm test                         # vitest (engine, content, render, services)
npm run typecheck                # tsc --noEmit
npm run lint
npm run content:validate         # schema + syllabus refs + duplicates + LaTeX; run after ANY content edit
npm run content:coverage         # per-topic counts vs launch targets
npm run content:generate -- --topic <topicId> --count 10 [--dry-run]   # AI generation + verification
npm run db:generate              # after editing src/db/schema.ts → new SQL migration
```

Before saying work is done: `npm run typecheck && npm test && npm run lint`, plus
`npm run content:validate` if content changed.

## Rules that matter here

- **Next.js 16 is not the Next.js you remember.** `middleware.ts` is now `src/proxy.ts`, and
  `params`/`searchParams`/`cookies()` are async. Check `node_modules/next/dist/docs/` before
  using a Next API.
- **Answer keys never reach the client before an attempt exists.** Serialize unanswered
  questions only with `toPublicQuestion()` (`src/server/services/questions.ts`).
- **Layering:** `app/` → `server/services/` → `db/`, `lib/*`. `lib/engine/` is pure (no
  DB/IO/Date.now: pass `now` in) and every change there needs a test.
- **Every route handler / Server Action does its own auth** with `requireUser()` /
  `requireRole()`. It takes `userId` from the session, never from the body. Parse input with
  Zod `.strict()`. Details: `docs/SECURITY.md`.
- **Rendering rich text:** only through `renderRich()` (`src/lib/render/`). Never
  `dangerouslySetInnerHTML` on anything else. AI output renders as plain text.
- **Content is code.** Questions live in `content/questions/<subject>/<unit>.json` and are
  validated by `src/lib/content/schema.ts`. Topic IDs are permanent: never rename, only add +
  migrate. Every wrong option should carry a `misconceptionId` or `whyWrong`.
- **Provenance is mandatory.** Every question has `source`, `sourceRef`, `license`. Never
  import from coaching material or scraped sites (see DATA_STRATEGY §3).
- **Claude API usage** lives in `src/lib/ai/`. Structured outputs + Zod re-validation,
  per-user daily quota, `AI_ENABLED` kill switch. Model ID comes from env `AI_MODEL`
  (default `claude-opus-5`). Use the `claude-api` skill before changing SDK calls.
- **DB changes:** edit `src/db/schema.ts` → `npm run db:generate` → review the SQL →
  commit schema and migration together. Never edit an applied migration.
- Don't read `.env` (it's denied). Add new variables to `.env.example` and `src/lib/env.ts`.
- Match existing code style: small modules, named exports, no default exports except Next
  pages/layouts, no classes for plain data.

## Project skills (`.claude/skills/`)

`/add-question` · `/generate-questions` · `/import-dataset` · `/content-coverage` ·
`/db-change` · `/new-endpoint` · `/security-check` · `/engine-change`

Subagents (`.claude/agents/`): `question-author`, `question-verifier` (independent solver),
`pedagogy-reviewer`, `security-reviewer`.
