# src/lib/ai: Claude integration

- `analyze-working.ts`: per-attempt tutor analysis (runtime, user-facing).
- `content-pipeline.ts`: question generation, import enrichment, independent solving (CLI only).
- `schemas.ts`: Zod schemas for structured outputs, plus `sanitizeAnalysis`.

Rules:
- Load the `claude-api` skill before changing SDK calls. Model IDs come from env `AI_MODEL`
  (default `claude-opus-5`). Don't hard-code a different model without the user asking.
- Calls use `client.beta.messages.parse` with `betaZodOutputFormat` (structured outputs), adaptive thinking,
  `output_config.effort`, and server-side refusal fallbacks (`fallbacks: "default"` + `server-side-fallback-2026-07-01`).
  Always check `stop_reason === "refusal"` and a null `parsed_output`.
- Model output is untrusted: re-validate with Zod, clamp lengths, and filter ids against the syllabus.
  Render it as plain text only.
- Student text goes inside `<student_working>` and the system prompt tells the model to treat it as data.
  Keep system prompts byte-stable (no timestamps) so prompt caching works.
- The runtime path must check `AI_ENABLED`, the API key and the per-user daily quota **before** calling.
- Never send user PII (email, name) to the model.
