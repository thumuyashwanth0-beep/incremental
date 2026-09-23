# content/: the question bank (content as code)

- `syllabus/jee-main.json`: Subject → Unit (official NTA) → Topic (ours). **Topic IDs are permanent**:
  attempts and mastery reference them. Add new ones freely; renaming or removing one needs a DB migration that
  remaps attempts. Unit `weight` drives adaptive priority and coverage targets.
- `misconceptions/<subject>.json`: `{id, topicId, description, remediation}`. The id is `<topicId>.<kebab-name>`.
  `description` names the wrong belief; `remediation` says how to fix it and gives a check the student can use.
- `questions/<subject>/<unitSlug>.json`: curated questions. The validator enforces the file ↔ topic mapping.
- `questions/_imports/`: staged external datasets (git-ignored, regenerate with `npm run import:*`).

The schema is `src/lib/content/schema.ts`. After any edit run `npm run content:validate` (a hook does this
automatically when Claude edits these files). Workflows: `/add-question`, `/generate-questions`,
`/import-dataset`, `/content-coverage`.

Non-negotiables:
- Every numeric answer is verified by computation, not by eye.
- Every wrong option of an `original`/`ai_generated` question has `misconceptionId` or `whyWrong`.
- `source`, `sourceRef`, `license` are always set. No coaching-institute or scraped content, ever.
- Status meanings: `draft` (not served) · `auto_verified` (served in practice when PUBLISH_AUTO_VERIFIED) ·
  `in_review` (not served) · `published` · `retired` (never served; kept for attempt history).
- `mockReserve: true` questions are never shown in practice. Keep them for mock tests.
