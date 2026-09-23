---
name: add-question
description: Author one or more JEE questions by hand into content/questions/ following the content schema and quality rubric. Use when the user asks to add, write, or fix a specific question.
---

# Add a question

1. **Find the topic.** Look up the exact `topicId` in `content/syllabus/jee-main.json`. If the
   concept is not in the NTA JEE Main syllabus, stop and tell the user.
2. **Open the target file** `content/questions/<subject>/<unitSlug>.json`. The unit slug is the part
   of the unit id after the subject, e.g. `phy.kinematics` → `content/questions/phy/kinematics.json`.
   Create it as `{ "questions": [] }` if missing.
3. **Check misconceptions** in `content/misconceptions/<subject>.json`. Reuse an existing id
   when a distractor matches it; otherwise add a new misconception
   `{id: "<topicId>.<kebab-name>", topicId, description, remediation}`.
4. **Write the question** using the schema in `src/lib/content/schema.ts`:
   - `externalId`: `orig:<subject>-<short-topic>-<nnn>` (next free number in the file)
   - `source: "original"`, `sourceRef: "hand-authored"`, `license: "proprietary"`, `status: "published"`
     (use `"draft"` if unsure of anything)
   - stem in Markdown with `$...$` LaTeX; SI units; no figures
   - `single`: exactly 4 options A–D, exactly one correct; **every wrong option has
     `misconceptionId` or `whyWrong`**; distractors are the answers produced by real mistakes
     (sign error, missed factor of 2, wrong formula), not random numbers
   - `numerical`: `answer.value` plus `tolerance` (0 for integers; ≤1% otherwise), stem states rounding
   - `solution`: key idea first, then numbered steps, final answer bolded
   - 1–3 `hints`, progressive
   - `difficulty` 1–5 and `expectedTimeSec` (easy 60–90, medium 120–180, hard 200–300)
5. **Verify the answer yourself.** For anything numeric, compute it with a quick
   `python3 -c` calculation. Do not trust mental arithmetic. For hard questions, delegate an
   independent solve to the `question-verifier` subagent *without* giving it the key.
6. Run `npm run content:validate` (the PostToolUse hook does this automatically) and fix all errors.
7. `npm run content:import` if the dev DB is running.

## Quality rubric (all must hold)
- Exactly one defensible answer; no hidden assumptions (state g = 10 or 9.8, ideal conditions, etc.)
- Solvable in the expected time without a calculator (JEE has none)
- Matches JEE Main level for its difficulty; no JEE-Advanced-only concepts unless type `multi`
- Distractors plausible and diagnostic; options sorted in a natural order for numbers
