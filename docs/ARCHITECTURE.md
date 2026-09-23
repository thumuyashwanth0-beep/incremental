# Architecture

## Stack (and why)

| Layer | Choice | Why |
|---|---|---|
| App | **Next.js 16 (App Router) + React 19 + TypeScript** | One deployable for UI + API. Server Components keep answer keys server-side. Next 16 has breaking changes (e.g. `middleware` → `proxy`), so read `node_modules/next/dist/docs/` before using a Next API |
| Styling | Tailwind CSS 4 | |
| DB | **PostgreSQL 16** | Relational data (users ↔ attempts ↔ questions ↔ topics), JSONB for options/diagnosis, strong analytics SQL |
| ORM | **Drizzle ORM + drizzle-kit** migrations, `postgres` driver | Typed SQL, no codegen step, plain SQL migrations committed to git |
| Validation | **Zod 4** | One schema for content files, API bodies and AI structured output |
| Auth | Own session auth: argon2id + random session tokens (sha256 stored) in httpOnly cookies | Small, auditable, no vendor. Google OAuth added in P1 |
| Math | KaTeX (server-side render, `trust: false`) | Fast; no client JS needed for rendering |
| AI | Anthropic Claude via `@anthropic-ai/sdk` (structured outputs) | Working analysis, question generation and verification |
| Tests | Vitest | Engine + validators + API services |
| Local infra | docker compose (Postgres) | |
| Prod (suggested) | Container on any Node host (Fly/Render/Railway/ECS) + managed Postgres (Neon/RDS) in `ap-south-1` (India, for latency and data locality) | |

## Layout

```
content/                      # CONTENT AS CODE (source of truth for questions)
  syllabus/jee-main.json      # subjects → units → topics (+ weights)
  misconceptions/<subj>.json
  questions/<subj>/<unit>.json
docs/                         # product/architecture/data/security docs (read these)
scripts/                      # CLI: content validate/import/generate/coverage, db seed
src/
  app/                        # Next.js routes (UI pages + /api route handlers)
    api/…/route.ts            # thin: parse → auth → service → JSON
  proxy.ts                    # security headers; redirects unauthenticated users (Next 16 "proxy" = old middleware)
  db/                         # drizzle schema, client, migrations
  lib/
    engine/                   # PURE learning logic (diagnosis, mastery, selection, review) + tests
    content/                  # content Zod schemas, validation, hashing
    syllabus/                 # syllabus loader, targets
    ai/                       # Claude client + prompts + structured schemas
    auth/                     # password hashing, sessions, guards
    security/                 # rate limiting, origin check
    render/                   # markdown+LaTeX → safe HTML
  server/services/            # business logic: DB + engine (used by pages AND api routes)
  components/                 # React components
```

**Dependency rule:** `app → server/services → (db, lib/*)`. `lib/engine` imports nothing from
db/app. Client components never import `server/*` or `db/*` (enforced with `import "server-only"`).

## Request flow: answering a question

```
Client <QuestionCard> ──POST /api/attempts {questionId, sessionId, response, timeMs, confidence, working}
  → route.ts: requireUser() → origin check → zod parse → rate limit
  → services/attempts.submitAttempt():
       load question (with key) → engine.grade() → engine.diagnose()
       tx: insert attempt, upsert topic_mastery (engine.updateMastery), schedule review (engine.review)
  ← { correct, key, solution, diagnosis, masteryDelta }
Client may then POST /api/attempts/:id/analyze → services/analysis → lib/ai/analyze-working (Claude)
```

The answer key and solution are **never** sent to the client before an attempt exists.
`toPublicQuestion()` is the only serializer for unanswered questions.

## Data model (see `src/db/schema.ts`)

`users`, `sessions` · `units`, `topics`, `misconceptions` (seeded from content) ·
`questions` (versioned, status, source/license) · `practice_sessions` · `attempts` ·
`topic_mastery` (PK user+topic) · `review_items` · `question_reports` · `ai_usage` (per-user
daily quota).

## Scaling notes
- Hot paths: the next-question query (indexed by topic_id, status, difficulty) and attempt insert.
  Both are single-row operations; Postgres handles thousands per second.
- The rate limiter is in-memory (single instance). Move it to Redis/Upstash before running
  more than one instance (interface: `src/lib/security/rate-limit.ts`).
- AI calls are the slow and expensive part. They are on-demand, quota-limited per user per day,
  and their results are cached in `attempts.aiAnalysis`.
- Analytics queries run on the primary for now; add a read replica/materialised views at scale.
