import { requireUser } from "@/lib/auth/session";
import { handler, json } from "@/lib/http";

export const GET = handler(async () => json({ user: await requireUser() }));
