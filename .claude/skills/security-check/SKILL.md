---
name: security-check
description: Review the current diff against the project's security and privacy rules (docs/SECURITY.md). Use before finishing any change that touches auth, endpoints, rendering, AI prompts, user data or dependencies.
---

# Security check

Run `git diff` (and `git diff --staged`), then check each item. Report pass/fail with `file:line`.

1. Every new/changed route handler and Server Action calls `requireUser()`/`requireRole()` itself.
2. `userId` comes only from the session. Every user-data query filters by it.
3. Request input is parsed with Zod `.strict()`, with length/size limits on strings and arrays.
4. State-changing route handlers call `assertSameOrigin()`.
5. No answer/solution/misconception data is serialised for an unanswered question
   (grep the diff for `answer`, `solution`, `whyWrong`).
6. `dangerouslySetInnerHTML` is only used with `renderRich()` output.
7. AI: untrusted text is delimited and treated as data; output is schema-validated; quota checked
   *before* the call; no PII in prompts.
8. No secrets in code or logs. New env vars are in `.env.example` and `src/lib/env.ts`.
9. Errors don't leak internals (no stack or SQL text in responses).
10. New dependencies: why, maintenance status, install scripts, `npm audit`.
11. Privacy: no new personal data fields without a DPDP justification; no third-party trackers.

For a deeper pass, delegate to the `security-reviewer` subagent.
