---
name: content-coverage
description: Report question-bank coverage against per-topic launch targets and propose a fill plan. Use when asked how much content exists, what's missing, or whether the bank is launch-ready.
---

# Content coverage

1. `npm run content:coverage` (reads the JSON content, so no DB is needed). Add `--json` for
   machine output.
2. Summarise for the user:
   - totals vs launch target (practice ≈ 6,600 + mock reserve 1,500; see DATA_STRATEGY §5)
   - practice-ready topics (≥ 30 published, band mix OK) / total topics, per subject
   - top 15 gaps ranked by `unit.weight × missing`
   - band/type imbalances (e.g. numerical < 20%, no hard questions)
3. Propose a fill plan: which topics go to `/generate-questions`, which to `/import-dataset`, and
   an approximate cost (the generate script's `--dry-run` prints token estimates).

Targets live in `src/lib/syllabus/targets.ts`. When changing the formula, update DATA_STRATEGY §5 too.
