import { handler, json, readJson } from "@/lib/http";
import { assertSameOrigin, clientIp } from "@/lib/security/origin";
import { rateLimit } from "@/lib/security/rate-limit";
import { login, LoginInput } from "@/server/services/auth";

export const POST = handler(async (req) => {
  assertSameOrigin(req);
  rateLimit(`login:ip:${clientIp(req)}`, 10, 15 * 60);
  const body = LoginInput.parse(await readJson(req));
  rateLimit(`login:email:${body.email}`, 10, 15 * 60);
  return json({ user: await login(body) });
});
