# Data Strategy: Questions, Sources, Storage, Coverage Targets

This is the most important doc for launch. The app is only as good as its question bank.

## 1. What a "question" is (content model)

Every question, whatever its source, is normalised to the same shape (Zod schema:
`src/lib/content/schema.ts`, the single source of truth):

| Field | Notes |
|---|---|
| `externalId` | Stable, unique, human-readable key: `<source>:<slug>`, e.g. `orig:phy-proj-001`, `jeebench:2019-p1-phy-12`. Import is idempotent on this key. |
| `topicId` | Must exist in `content/syllabus/jee-main.json`. One primary topic per question. |
| `secondaryTopicIds` | Optional extra topics (multi-concept questions count toward mastery of each at half weight). |
| `type` | `single` (4 options, one correct; JEE Main Section A) · `numerical` (integer/decimal answer; Section B) · `multi` (multi-correct; JEE Advanced style, optional) |
| `stem` | Markdown + LaTeX (`$...$`, `$$...$$`). No raw HTML. |
| `options` | For `single`/`multi`: exactly 4, keys `A`–`D`. **Each wrong option carries `misconceptionId` and/or `whyWrong`**. This lets us give a diagnosis without any AI call. |
| `answer` | `{ "kind": "choice", "keys": ["B"] }` or `{ "kind": "numeric", "value": 12.5, "tolerance": 0.01 }` |
| `solution` | Full worked solution, stepwise, with the key idea stated first. |
| `hints` | 1–3 progressive hints (nudge → method → first step). |
| `difficulty` | 1–5 (author estimate; later recalibrated from attempt data, see LEARNING_ENGINE.md). |
| `expectedTimeSec` | Time a well-prepared student needs (JEE Main averages about 144 s per question). |
| `skills` | Tags such as `formula-recall`, `multi-step`, `graph-reading`, `unit-conversion`, `algebra-heavy`. |
| `source`, `sourceRef`, `license` | Provenance, required. See §3. |
| `status` | `draft → auto_verified → in_review → published → retired` |

Misconceptions live in `content/misconceptions/*.json` (id, topicId, description,
remediation). They are shared across questions, so we can say "you've made the *sign of g in
projectile motion* mistake 4 times this week".

## 2. Storage

- **Git is the source of truth for content**: `content/questions/<subject>/<unit>.json`.
  PR review means content review. Diffs are readable. No vendor lock-in.
- **Postgres is the runtime store**: `npm run content:import` upserts into `questions` by
  `externalId`. A `contentHash` (sha256 of the normalised stem+options+answer) detects edits and
  near-duplicate imports.
- **Editing a published question**: bump `version`. The old row is kept for attempt history.
  Attempts reference `(questionId, questionVersion)`.
- **Admin UI edits** (phase 2) write to the DB with `status=in_review`. `npm run content:export`
  writes them back to JSON so git stays the source of truth.
- **Images/diagrams** (phase 2): object storage (S3/R2), referenced by content hash in the stem
  (`![fig](asset:sha256…)`). Many PYQs rely on figures, which is why diagram-dependent questions
  are excluded from the first import.

## 3. Sources, ranked by trust and legal clarity

| # | Source | Volume | License / legal status | Use |
|---|---|---|---|---|
| 1 | **Original hand-authored** (`orig:`) | small | ours | Seed and gold set; used for calibration and to evaluate the AI pipeline |
| 2 | **AI-generated originals** (`gen:`) via Claude, with independent verification | **main volume** | ours (original work) | Fills every topic up to target |
| 3 | **JEEBench** (`jeebench:`), 515 JEE Advanced 2016–23 problems, [github.com/dair-iitd/jeebench](https://github.com/dair-iitd/jeebench) | 515 → 474 staged (41 had unparseable options) | MIT (repo); underlying papers are IIT JAB's | Hard tier / Advanced mode. No solutions included, so we generate them and verify against `gold` |
| 4 | **PhysicsWallahAI/JEE-Main-2025-Math** (`pw25:`), [HF dataset](https://huggingface.co/datasets/PhysicsWallahAI/JEE-Main-2025-Math) | 475 → 462 staged | Apache-2.0 | Real exam-level maths. Has answers but no topic tags or solutions, so we classify and generate solutions |
| 5 | **NTA official PYQ papers + final answer keys** (`nta:`) | ~90 questions per shift, 20+ shifts per year | Publicly released by NTA; **reuse rights not explicitly granted, so get legal sign-off before production** | Highest value for students ("PYQ mode"). Import pipeline is ready; kept behind `ALLOW_SOURCES` until cleared |
| ✗ | Coaching-institute material, ExamSIDE, scraped sites | — | copyrighted | **Never import.** `source` is a closed enum, so a new source needs a code change and a license review. |

`scripts/import/*` embeds each source's license string. The validator rejects questions with no
`license`.

## 4. AI generation pipeline (fills the bank without manual entry)

`npm run content:generate -- --topic phy.kinematics.projectile --count 20`

1. **Plan.** Read the coverage gap for the topic: missing difficulty bands and types, current
   misconception list, and 3–5 existing published questions as style exemplars.
2. **Generate** (Claude, structured output validated by the Zod schema): N questions, each with
   solution, hints, and a misconception tag on every distractor. Prompt rules: JEE Main
   syllabus only, NCERT-consistent notation, SI units, numbers chosen so the answers are clean,
   no reliance on figures.
3. **Independent solve** (fresh call, no answer key, no solution shown): the model solves the
   stem cold. It must reach the keyed answer. For numerical questions the tolerance is ≤1%.
4. **Distractor audit**: a check that no distractor is also defensibly correct and that the stem
   is unambiguous.
5. **Programmatic checks**: schema, LaTeX parses (KaTeX), option uniqueness, near-duplicate
   check (normalised content hash = error; same stem template with different numbers = warning),
   answer-key format, difficulty/time sanity.
6. Pass all checks → `status=auto_verified`. Any failure → `draft`, with the failure reason
   stored.
7. **Publish policy**: `auto_verified` questions go live in practice mode (`PUBLISH_AUTO_VERIFIED=true`)
   with an in-app "Report a problem" button. They are **never** used in mock tests until a human
   reviewer or 50+ attempts show normal statistics (see LEARNING_ENGINE.md §5, item health).
8. **Post-launch quality loop**: a question is auto-retired to `in_review` when any of these hold:
   - ≥3 user reports
   - p(correct) < 0.1 with ≥30 attempts (key may be wrong)
   - a distractor chosen more often than the key by high-mastery students
   - negative discrimination

Cost: about 1.2 model calls per generated question (1 generation call per 5 questions + 1 independent solve).
`--dry-run` prints a USD estimate (≈ $0.30/question on `claude-opus-5`, so roughly $2–2.5k for the ~8,100
launch bank). A `--batch` mode on the Messages Batches API would halve that; it is on the roadmap.

## 5. How many questions? (targets)

Implemented in `src/lib/syllabus/targets.ts` and reported by `npm run content:coverage`.

**Per topic (182 topics):** a minimum of **30 published questions** before a topic is
"practice-ready":

| Band | Share | Why |
|---|---|---|
| Easy (difficulty 1–2) | 30% (9) | Build-up and confidence; the entry point for diagnostics |
| Medium (3) | 45% (14) | Where JEE Main actually sits |
| Hard (4–5) | 25% (7) | Separates 99+ percentile aspirants |
| **Numerical-type** | ≥ 20% | Mirrors Section B (5 of 25) |

Why 30: an adaptive session serves about 10 questions per topic. A student re-tested on a
mistake must get a **sibling** question (same concept, different numbers or framing), not the
same one. That needs at least 2 per concept per band. It also avoids repeats for 3 or more
sessions.

**Per unit:** `max(30 × topics, 80 × unit.weight)`. High-weight units (Coordinate Geometry,
Electrostatics, Current Electricity, Coordination Compounds…) get proportionally more.

**Totals at launch:**

| Pool | Count |
|---|---|
| Physics practice | ~2,460 |
| Chemistry practice | ~2,120 |
| Maths practice | ~2,010 |
| **Practice total** | **~6,600** |
| Mock-test reserve (20 full mocks × 75, never shown in practice) | 1,500 |
| **Launch total** | **≈ 8,100** |
| Mature target (year 1): 100+/topic, 50 mocks | ≈ 25,000 |

**Seed/dev minimum** (the app runs end to end): the hand-written set in `content/questions/`
covers every subject.

## 6. Syllabus decomposition

`content/syllabus/jee-main.json`: **Subject → Unit (54, official NTA units: 20 Physics, 20
Chemistry, 14 Maths) → Topic (182, our split)**. Topics are the unit of mastery tracking and
coverage. Misconceptions hang off topics. Do not rename topic IDs: attempts and mastery reference
them. To split a topic, add new IDs and write a migration that maps old attempts.

Unit `weight` = estimated questions per 25-question section (public analyses of 2023–25
shifts). It drives adaptive practice priority and coverage targets. Re-check it yearly.

## 7. Adding new questions (workflows)

| Who | How |
|---|---|
| Developer / content author | `/add-question` skill → edit JSON → `npm run content:validate` → PR |
| Bulk | `/generate-questions` skill → review `auto_verified` diff → PR |
| New dataset | `/import-dataset` skill (license check first) |
| Admin (phase 2) | Admin UI → `in_review` → reviewer publishes → nightly `content:export` PR |
| Students | "Report a problem" → `question_reports` → review queue |
