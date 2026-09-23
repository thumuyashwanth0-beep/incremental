import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { handler, json, readJson } from "@/lib/http";
import { assertSameOrigin } from "@/lib/security/origin";
import { rateLimit } from "@/lib/security/rate-limit";
import { analyzeAttempt } from "@/server/services/analysis";

const Body = z.object({ working: z.string().max(4000).optional() }).strict();

export const POST = handler<{ id: string }>(async (req, { params }) => {
  const user = await requireUser();
  assertSameOrigin(req);
  rateLimit(`analyze:${user.id}`, 10, 60); // burst guard; the daily quota is enforced in the service
  const id = z.string().uuid().parse((await params).id);
  const body = Body.parse(await readJson(req));
  return json({ analysis: await analyzeAttempt(user.id, id, body.working) });
});
