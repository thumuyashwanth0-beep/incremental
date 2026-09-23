---
name: generate-questions
description: Fill question-bank coverage gaps with the AI generation + independent verification pipeline (scripts/generate-questions.ts). Use when asked to generate questions, fill a topic, or scale the content bank.
---

# Generate questions with the AI pipeline

The pipeline spends API credits, so always confirm scope and a cost estimate with the user first.

1. `npm run content:coverage` → pick topics below target. Prefer high `unit.weight` and missing
   difficulty bands or types (numerical ≥ 20%).
2. Dry run for a cost estimate:
   `npm run content:generate -- --topic <topicId> --count <n> --dry-run`
   Report the estimate to the user. Get approval for anything above ~200 questions.
3. Run it. Output goes to `content/questions/<subject>/<unit>.json` with `source: "ai_generated"`,
   `externalId: gen:<topicId>:<hash>`. Status is `auto_verified` if the independent solve agreed with
   the key and all programmatic checks passed, otherwise `draft` with `reviewNotes` explaining why.
4. `npm run content:validate`, then **review a sample yourself**: at least 3 per run, all hard ones.
   Check the rubric in `/add-question`. For a second opinion, run the `question-verifier` subagent on
   the stem only.
5. Delete or fix `draft` items. Never flip `draft → published` without fixing the recorded failure.
6. Summarise: generated / auto_verified / draft counts, and the coverage delta.

Pipeline details and publish policy: `docs/DATA_STRATEGY.md` §4. For large runs (> 500), first add a
`--batch` mode that uses the Messages Batches API (50% cheaper). It doesn't exist yet.
