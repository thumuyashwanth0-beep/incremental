import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { handler, json, readJson } from "@/lib/http";
import { assertSameOrigin } from "@/lib/security/origin";
import { rateLimit } from "@/lib/security/rate-limit";
import { submitAttempt } from "@/server/services/attempts";

const Response_ = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("choice"), keys: z.array(z.enum(["A", "B", "C", "D"])).min(1).max(4) }).strict(),
  z.object({ kind: z.literal("numeric"), value: z.number().finite() }).strict(),
  z.object({ kind: z.literal("skip") }).strict(),
]);

const Body = z
  .object({
    sessionId: z.string().uuid(),
    questionId: z.string().uuid(),
    response: Response_,
    timeTakenMs: z.number().int().min(0).max(3 * 3600 * 1000),
    confidence: z.enum(["sure", "unsure", "guess"]).optional(),
    hintsUsed: z.number().int().min(0).max(3).default(0),
    working: z.string().max(4000).optional(),
  })
  .strict();

export const POST = handler(async (req) => {
  const user = await requireUser();
  assertSameOrigin(req);
  rateLimit(`attempts:${user.id}`, 120, 60);
  const body = Body.parse(await readJson(req));
  return json(await submitAttempt(user.id, body), 201);
});
