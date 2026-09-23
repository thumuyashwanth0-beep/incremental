import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { handler, json } from "@/lib/http";
import { rateLimit } from "@/lib/security/rate-limit";
import { nextQuestion } from "@/server/services/practice";

export const GET = handler<{ id: string }>(async (_req, { params }) => {
  const user = await requireUser();
  rateLimit(`next:${user.id}`, 120, 60);
  const id = z.string().uuid().parse((await params).id);
  return json(await nextQuestion(user.id, id));
});
