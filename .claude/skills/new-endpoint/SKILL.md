---
name: new-endpoint
description: Add a new API route handler or Server Action following project conventions (auth, Zod, rate limit, origin check, service layer, tests, API docs). Use whenever adding or changing an HTTP endpoint.
---

# New endpoint

Template: `src/app/api/attempts/route.ts` is the reference implementation. Copy its shape.

1. **Service first**: put logic in `src/server/services/<area>.ts` as a function that takes `userId`
   plus validated input. Pages can call it directly.
2. **Route handler** `src/app/api/<path>/route.ts`, kept thin:
   ```ts
   export const POST = handler(async (req) => {
     const user = await requireUser();                 // or requireRole("reviewer")
     assertSameOrigin(req);                            // state-changing methods
     await rateLimit(`attempts:${user.id}`, 120, 60);  // key, limit, windowSec
     const body = Body.parse(await req.json());        // zod .strict()
     return json(await service(user.id, body), 201);
   });
   ```
   `handler()` (src/lib/http.ts) maps ZodError→400, AuthError→401/403, RateLimitError→429,
   NotFound→404 and anything else to 500 with no details.
3. Never return raw DB rows. Map them to DTOs. For questions, use `toPublicQuestion()` unless an attempt exists.
4. Tests: service-level tests for the logic and authorization (user A can't read user B's data).
5. Document it in `docs/API.md`. Run `/security-check` on the diff.
