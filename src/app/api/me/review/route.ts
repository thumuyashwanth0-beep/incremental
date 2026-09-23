import { requireUser } from "@/lib/auth/session";
import { handler, json } from "@/lib/http";
import { reviewStatus } from "@/server/services/analytics";

export const GET = handler(async () => {
  const user = await requireUser();
  return json(await reviewStatus(user.id));
});
