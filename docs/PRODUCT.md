# Product: JEE Prep Coach

**One line:** a practice app that goes beyond right or wrong. It works out *why* a student got a
JEE question wrong, what to fix, and what to practise next.

**Users:** JEE Main aspirants, Class 11–12 and droppers, usually 15–19 years old. Many use
mid-range Android phones on patchy mobile data. Many are **minors**, which matters for consent
and privacy (see SECURITY.md).

## Core loop

```
pick / get recommended practice → answer (timer runs, optional confidence + working)
      → instant feedback: correct?, WHY wrong (misconception), solution, how to improve
      → mastery & weak-topic model updates → next question chosen adaptively
      → wrong questions scheduled for spaced re-test with a sibling question
```

## Feature set

Priority: **P0** = MVP (built first) · **P1** = launch · **P2** = post-launch.

### Practice
| P | Feature |
|---|---|
| P0 | Topic practice (subject → unit → topic), MCQ (single correct) and numerical-answer questions, LaTeX rendering |
| P0 | Per-question timer; time compared to `expectedTimeSec` |
| P0 | Confidence tap (Sure / Unsure / Guess) before submit |
| P0 | "Show your working" box (optional text) |
| P0 | Adaptive practice: engine picks topic and difficulty (weak × high-weight first, aim ~70% success) |
| P1 | Photo of handwritten working → AI reads it (Claude vision) |
| P1 | Progressive hints (using a hint caps mastery credit) |
| P1 | Bookmarks and personal notes per question |
| P1 | PYQ mode (by year/shift), after legal clearance (DATA_STRATEGY §3) |
| P2 | Custom test builder (pick units, count, time) |

### Mistake diagnosis ("how you solved it and how to improve")
| P | Feature |
|---|---|
| P0 | **Distractor diagnosis**: every wrong option maps to a named misconception, giving an instant, free explanation of *why* that option is tempting and wrong |
| P0 | **Behaviour signals**: too fast and wrong → careless or guessing; too slow and right → method is inefficient; *sure* and wrong → real misconception (high priority); *guess* and right → fragile, re-test |
| P0 | **AI working analysis** (Claude): reads the student's working, finds the first wrong step, classifies the error (conceptual / formula / calculation / sign / units / misread / incomplete), gives a targeted tip and the prerequisite topic to revisit |
| P0 | Error taxonomy stored per attempt → aggregated per student |
| P1 | Student self-tagging when no working is given ("I misread", "silly calculation"…) |
| P1 | "Mistake notebook": all wrong answers grouped by misconception, with re-test buttons |

### Tracking and insight
| P | Feature |
|---|---|
| P0 | Dashboard: mastery per subject/unit/topic, accuracy, average time ratio |
| P0 | Weak topics ranked by `weight × (1 − mastery)`, i.e. "fix these for the most marks" |
| P0 | Error-type breakdown ("38% of your Physics mistakes are calculation errors") |
| P0 | Spaced-repetition review queue for missed questions (sibling questions) |
| P1 | Recurring misconception alerts |
| P1 | Weekly report (in-app, email opt-in, parent view opt-in) |
| P1 | Streaks and daily goals (light gamification; no leaderboards shaming weaker students) |
| P2 | Syllabus completion vs exam date: a study planner that back-plans from the student's JEE session date |

### Mock tests
| P | Feature |
|---|---|
| P1 | Full JEE Main mock: 75 questions (20 MCQ + 5 numerical per subject), 180 min, +4/−1 (no negative marking for numericals), NTA-style palette (answered / marked for review / not visited) |
| P1 | Post-mock analysis: attempt strategy, time sinks, accuracy by section, "marks lost to negatives", topic heatmap |
| P2 | Percentile and rank estimate (needs a large cohort; label clearly as an estimate) |
| P2 | Section-wise and part-syllabus mocks |

### Content operations
| P | Feature |
|---|---|
| P0 | Content-as-code JSON, validator, importer, coverage report (CLI) |
| P0 | AI generation and verification pipeline (CLI) |
| P1 | Admin/reviewer web UI: queue, edit, publish, retire, reports |
| P1 | Item statistics: p-value, discrimination, distractor analysis, auto-flagging |

### Platform
| P | Feature |
|---|---|
| P0 | Email + password auth, sessions |
| P1 | Google sign-in; parental consent flow for under-18s (DPDP Act) |
| P1 | PWA / offline question packs (low-bandwidth users) |
| P2 | Hindi and regional language support (NTA sets papers in 13 languages) |
| P2 | Native app (the REST API already exists for it) |

## What competitors do (research summary)

Common baseline features (so we need them): chapter-wise PYQs with solutions, full mock tests in
an NTA-like interface, basic accuracy/time analytics, bookmarks, formula sheets, rank predictors.
Embibe-style "behavioural" analytics (overtime, careless, too-fast) are the most advanced common
feature.

**Our differentiators:**
1. Misconception-tagged distractors, so every wrong answer explains itself for free and instantly.
2. Analysis of the student's *working*, not just the chosen option.
3. Sibling-question spaced repetition, which re-tests the concept rather than a memorised answer.
4. Weak-topic ranking weighted by exam marks.

## Non-goals (for now)
Video lectures, live classes, doubt-forum social features, NEET.

## Success metrics
- D7 retention; questions per active day (goal: 25+)
- **Re-test success rate**: share of misconception-tagged mistakes answered correctly on the
  sibling re-test. This is the core "are we actually teaching" metric.
- Mastery gain per hour of practice
- Content health: % of served questions with 0 open reports; key-error rate < 0.5%
