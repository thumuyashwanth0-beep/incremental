import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { handler, json, readJson } from "@/lib/http";
import { assertSameOrigin } from "@/lib/security/origin";
import { rateLimit } from "@/lib/security/rate-limit";
import { startSession } from "@/server/services/practice";

const Body = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("topic"), topicId: z.string().max(120) }).strict(),
  z.object({ mode: z.literal("adaptive"), subjectId: z.enum(["phy", "chem", "math"]).optional() }).strict(),
  z.object({ mode: z.literal("review") }).strict(),
]);

export const POST = handler(async (req) => {
  const user = await requireUser();
  assertSameOrigin(req);
  rateLimit(`sessions:${user.id}`, 30, 60);
  const s = await startSession(user.id, Body.parse(await readJson(req)));
  return json({ session: { id: s.id, mode: s.mode, topicId: s.topicId, subject: s.subject, targetCount: s.targetCount } }, 201);
});
