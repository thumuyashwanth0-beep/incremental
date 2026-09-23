import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { handler, json, readJson } from "@/lib/http";
import { assertSameOrigin } from "@/lib/security/origin";
import { rateLimit } from "@/lib/security/rate-limit";
import { reportQuestion } from "@/server/services/reports";

const Body = z
  .object({ reason: z.enum(["wrong_key", "typo", "unclear", "out_of_syllabus", "other"]), note: z.string().max(1000).optional() })
  .strict();

export const POST = handler<{ id: string }>(async (req, { params }) => {
  const user = await requireUser();
  assertSameOrigin(req);
  rateLimit(`report:${user.id}`, 20, 24 * 3600);
  const id = z.string().uuid().parse((await params).id);
  const body = Body.parse(await readJson(req));
  await reportQuestion(user.id, id, body.reason, body.note);
  return json({ ok: true }, 201);
});
