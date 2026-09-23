# Learning Engine: diagnosis, mastery, selection, review

Code: `src/lib/engine/`. **Pure functions only, no DB and no I/O**, so everything here is
unit-tested (`src/lib/engine/*.test.ts`). The services layer loads data, calls the engine, and
persists the results.

## 1. Attempt → diagnosis (`diagnosis.ts`)

Input: question (key, options, expected time, difficulty), the student's response (selected
option(s) or numeric value, time taken, confidence, hints used).

Output `Diagnosis`:
- `outcome`: `correct | incorrect | skipped`
- `misconceptionId`: from the chosen distractor, if tagged
- `timeFlag`: `rushed` (< 0.35 × expected), `normal`, `slow` (> 2 × expected)
- `signal`, one of:
  | correct? | confidence | time | signal | meaning |
  |---|---|---|---|---|
  | ✗ | sure | any | `misconception` | Firm wrong belief. Highest-priority fix |
  | ✗ | any | rushed | `careless` | Likely a silly mistake or misread |
  | ✗ | guess | any | `knowledge_gap` | Doesn't know it yet |
  | ✗ | else | — | `error` | Generic wrong answer |
  | ✓ | guess/unsure | any | `fragile` | Right but shaky. Schedule a re-test |
  | ✓ | any | slow | `inefficient` | Right, but too slow for exam pace |
  | ✓ | sure | normal/rushed | `solid` | |
- `tips[]`: deterministic, templated from signal + misconception remediation.

The **AI analysis** (`src/lib/ai/analyze-working.ts`) runs only on request, or when working
text is present and the answer is wrong. It adds `errorType` (conceptual, formula,
calculation, sign, units, misread, incomplete, other), `firstWrongStep`, `explanation`,
`improvementTips`, `revisitTopicIds` (validated against the syllabus). It never re-grades: the
key decides correctness.

## 2. Mastery (`mastery.ts`)

Elo/Rasch-style ability per (student, topic), stored as `theta` (logit scale):

```
b        = difficultyToLogit(difficulty)            // 1..5 → −2..+2
p        = sigmoid(theta − b)                       // expected P(correct)
K        = max(0.15, 0.6 / sqrt(1 + n/5))           // large early, stable later
credit   = correct ? (hintsUsed ? 0.6 : 1) : 0
theta   += K × (credit − p)
mastery  = sigmoid(theta − 0.5)                     // shown to students as 0-100%, "medium-hard" anchored
```
Time does not change theta (it is too noisy). It feeds `avgTimeRatio`, which is shown
separately. Secondary topics are updated with half K.

Unit/subject mastery = weighted mean of topic mastery (weights = attempts, min 1), shown
only once a topic has ≥ 5 attempts. Below that the UI says "not enough data".

## 3. Adaptive selection (`selection.ts`)

1. **Due reviews first** (up to 30% of a session).
2. Otherwise pick a topic with probability ∝ `unitWeight × (1 − mastery) + explorationBonus`
   (the unseen-topic bonus decays).
3. Within the topic, choose the question whose `b` is closest to `theta − ln(0.7/0.3)` (≈ theta − 0.85),
   i.e. predicted success ≈ 70% (desirable difficulty). Exclude questions seen in the last
   14 days and mock-reserve items.
4. Tie-break at random (seeded per session, so it can be reproduced in tests).

## 4. Spaced repetition (`review.ts`)

For wrong, `fragile` and `careless` attempts:
- Schedule `dueAt = now + 1 day`. The re-test serves a **sibling** (same topic + same
  misconception if tagged, different questionId). It falls back to the same question only if no
  sibling exists.
- Correct re-test: interval × 2.5 (1 → 2.5 → 6 → 15 days), then retire from the queue after 3
  successes.
- Wrong re-test: interval resets to 1 day, `lapses += 1`. Three or more lapses → flag the topic
  as "stuck" and suggest the prerequisite topic.

## 5. Item health (question quality from attempt data)

Nightly job (P1): for each question with ≥ 30 attempts compute p-value, point-biserial
discrimination (vs student topic theta) and distractor pick rates. Auto-flag rules are in
DATA_STRATEGY §4.8. Recalibrate `b` from data when there are ≥ 100 attempts.

## 6. Weak-topic ranking (`recommendations.ts`)

`priority = unitWeight × (1 − mastery) × confidenceFactor(attempts)`. It is shown as "Fix
these for the most marks". It also surfaces the top recurring misconceptions (≥ 2 hits in 14
days) and error-type shares.
