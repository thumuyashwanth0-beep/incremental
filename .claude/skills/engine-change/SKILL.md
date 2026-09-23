---
name: engine-change
description: Change the learning engine (grading, diagnosis signals, mastery update, adaptive selection, spaced review) in src/lib/engine with tests and doc updates. Use when tuning how the app diagnoses mistakes, tracks mastery, or picks questions.
---

# Learning-engine change

1. Read `docs/LEARNING_ENGINE.md` and the module you are changing.
2. The engine is **pure**: no DB, no `Date.now()`, no `Math.random()` without an injected seed/rng.
   Pass `now` and `rng` in.
3. Write or adjust the test first (`src/lib/engine/<module>.test.ts`). Include a behavioural
   scenario, e.g. "student who keeps getting hard questions right converges to mastery > 0.8 within
   15 attempts" or "sure + wrong → misconception signal".
4. Implement, then `npx vitest run src/lib/engine`.
5. Changing mastery math changes existing users' numbers. Say so and consider a recompute script
   (`scripts/recompute-mastery.ts`) rather than a silent jump.
6. Update `docs/LEARNING_ENGINE.md` so the doc and the code agree.
