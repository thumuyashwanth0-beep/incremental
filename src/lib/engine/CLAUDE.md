# src/lib/engine: learning engine (pure)

Grading, diagnosis, mastery, adaptive selection, spaced review and recommendations.
Spec: `docs/LEARNING_ENGINE.md`. Keep the code and the spec in sync.

- **Pure functions only**: no DB, no fetch, no `Date.now()`/`new Date()` without an injected `now`, no
  `Math.random()` (use `seededRng`). This is what makes the behaviour testable and reproducible.
- Every behaviour change needs a test in `engine.test.ts`, preferably a scenario ("a student who …").
- `grade()` is the only thing that decides correctness. The AI never grades.
- Changing mastery math shifts every user's numbers. Call it out and plan a recompute.
- Use `/engine-change` for the workflow.
