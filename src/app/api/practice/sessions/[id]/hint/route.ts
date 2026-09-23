import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { handler, json, readJson } from "@/lib/http";
import { assertSameOrigin } from "@/lib/security/origin";
import { revealHint } from "@/server/services/practice";

const Body = z.object({ n: z.number().int().min(1).max(3) }).strict();

// POST because revealing a hint changes state (reduces mastery credit).
export const POST = handler<{ id: string }>(async (req, { params }) => {
  const user = await requireUser();
  assertSameOrigin(req);
  const id = z.string().uuid().parse((await params).id);
  return json(await revealHint(user.id, id, Body.parse(await readJson(req)).n));
});
