import { handler, json, readJson } from "@/lib/http";
import { assertSameOrigin, clientIp } from "@/lib/security/origin";
import { rateLimit } from "@/lib/security/rate-limit";
import { signup, SignupInput } from "@/server/services/auth";

export const POST = handler(async (req) => {
  assertSameOrigin(req);
  rateLimit(`signup:${clientIp(req)}`, 10, 15 * 60);
  const body = SignupInput.parse(await readJson(req));
  return json({ user: await signup(body) }, 201);
});
