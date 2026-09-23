# Security & Privacy Principles

Every change must keep these true. `/security-check` walks through this list.

## Threat model (what we protect)
1. **Answer keys and the mock reserve**: leaking them breaks the product (and mock integrity).
2. **Student data**: minors' personal data, performance history.
3. **AI budget**: prompt abuse can burn money.
4. **Accounts**: credential stuffing, session theft.

## Rules

### Authentication & sessions
- Passwords: **argon2id** (`@node-rs/argon2`, OWASP parameters: 19 MiB, t=2, p=1), min 8 chars, checked against a
  common-password list (P1). Never log passwords or hashes.
- Session token: 32 random bytes (base64url) in a cookie `sid`: `HttpOnly; Secure (prod);
  SameSite=Lax; Path=/`, fixed 30-day expiry (sliding renewal is a P1 item: it must re-set the cookie from a route handler). The **DB stores only sha256(token)**, so a DB
  leak cannot be replayed.
- Logout deletes the DB row. Changing the password deletes all of the user's sessions.
- Login/signup rate limit: 10 per 15 min per IP + per email. Generic error messages ("invalid
  email or password") so they don't reveal which emails are registered.

### Authorization
- Every route handler and Server Action calls `requireUser()` / `requireRole()` **itself**. Proxy
  redirects are UX, not security.
- Every query touching user data filters by `userId` from the session, **never** from the
  request body.
- Roles: `student`, `reviewer` (content), `admin`. Admin APIs check the role on the server.

### Input & output
- All request bodies/params are parsed with Zod (`.strict()`), with size limits (working text ≤
  4,000 chars, images ≤ 5 MB in P1).
- SQL only through Drizzle's parameterised builders. `sql\`\`` template only with bound params.
- Rendering: question text is Markdown+LaTeX rendered **server-side** to HTML by
  `lib/render`. Text is HTML-escaped first; KaTeX runs with `trust: false`, `strict: "ignore"`.
  `dangerouslySetInnerHTML` is allowed **only** with output of `renderRich()`.
- AI output is shown as plain text (React escapes it). It is never rendered as HTML.
- Security headers in `src/proxy.ts`: CSP (scripts only with a per-request nonce + `strict-dynamic`; `style-src 'unsafe-inline'` is needed for KaTeX's inline styles), `X-Frame-Options:
  DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, HSTS in prod.
- State-changing route handlers check `Origin` matches the host (CSRF). Server Actions get this
  from Next automatically.

### Data exposure
- `toPublicQuestion()` strips `answer`, `solution`, `whyWrong`, `misconceptionId`, `status`,
  `source*` before anything reaches the client for an unanswered question.
- Mock-reserve questions are only served by the mock service, and only while a mock is running.
- API errors return `{error: code}` with no stack traces. Server logs have user IDs, not emails.

### AI-specific
- Student working text is untrusted. It goes inside the user turn, clearly delimited, and the
  system prompt says to treat it as data. Output is **structured** (JSON schema) and
  re-validated with Zod. `revisitTopicIds` are filtered against the real syllabus.
- The AI never decides correctness; the key does.
- Per-user daily quota (`AI_DAILY_LIMIT`, default 30) plus a global kill switch (`AI_ENABLED`).
- The API key lives only in server env and is never sent to the client.
- Don't send PII to the model: only question content + the student's working.

### Secrets & config
- `.env` is never committed and never read by Claude (denied in `.claude/settings.json`).
  `.env.example` lists every variable.
- `src/lib/env.ts` validates env at boot with Zod and fails fast.

### Privacy (India DPDP Act 2023)
- Many users are **under 18**. DPDP requires *verifiable parental consent* for processing
  children's data and forbids tracking, behavioural monitoring for ads, and targeted advertising
  aimed at children. So: **no third-party ad or tracking SDKs**. First-party product analytics
  only. The P1 consent flow collects date of birth and runs parental consent for minors.
- Data minimisation: email, display name, optional exam date. No phone number, no school, no
  exact location.
- Account deletion endpoint (P1) hard-deletes attempts and mastery within 30 days. Export on
  request.
- Store data in an India region.

### Dependencies
- `npm audit` in CI. Lockfile committed. Pin major versions. Review new install scripts.
