---
name: import-dataset
description: Import questions from an external dataset (JEEBench, PhysicsWallahAI JEE-Main-2025-Math, NTA papers, or a new source) with license checks, topic classification and solution generation. Use when asked to import, ingest or load a question dataset.
---

# Import an external dataset

## 0. License gate (mandatory)
- Find the dataset's license **from its own card/repo**, not from blog posts. Record the URL.
- Allowed without review: MIT, Apache-2.0, CC-BY(-SA) (attribution shown in the UI), public domain.
- NTA official papers: importer exists, but they are only published when `ALLOW_SOURCES` includes `nta`
  (legal sign-off pending; see DATA_STRATEGY §3).
- **Refuse**: coaching material, scraped Q&A sites, anything "for personal use", unclear licenses.
  Tell the user why.

## 1. Existing importers (`scripts/import/`)
| Source | Command | Notes |
|---|---|---|
| JEEBench (MIT) | `npm run import:jeebench` | JEE Advanced; types MCQ / MCQ(multiple) / Integer / Numeric. Skip questions mentioning figures |
| PW JEE-Main-2025-Math (Apache-2.0) | `npm run import:pw25` | `question_type` 1=MCQ, 0=numerical. No topics or solutions |

Importers write `content/questions/_imports/<source>.json` with `status: "draft"` and
`topicId: null` when unknown.

## 2. Enrich
`npm run content:enrich -- --file content/questions/_imports/<source>.json` (Claude):
classify `topicId` (validated against the syllabus), estimate difficulty/time, write the solution,
tag distractors with misconceptions, then **independently solve** and compare to the dataset key.
Disagreements stay `draft` with notes. Never "fix" an official key silently.

## 3. Move into place
Once enriched and validated, the enrich script moves items into
`content/questions/<subject>/<unit>.json`. Run `npm run content:validate` and
`npm run content:coverage`, and report the counts.

## New source checklist
Write `scripts/import/<source>.ts` modelled on the existing ones: stable `externalId`
(`<source>:<native id>`), `source`, `sourceRef` (URL + row id), `license` string, LaTeX normalised
to `$...$`, options normalised to A–D.
