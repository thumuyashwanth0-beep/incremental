import { destroySession } from "@/lib/auth/session";
import { handler } from "@/lib/http";
import { assertSameOrigin } from "@/lib/security/origin";

export const POST = handler(async (req) => {
  assertSameOrigin(req);
  await destroySession();
  return new Response(null, { status: 204 });
});
