import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { dummyHash, hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, type SessionUser } from "@/lib/auth/session";
import { AppError, conflict } from "@/lib/errors";

export const SignupInput = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    password: z.string().min(8, "at least 8 characters").max(200),
    name: z.string().trim().min(1).max(80),
  })
  .strict();

export const LoginInput = z
  .object({ email: z.string().trim().toLowerCase().max(254), password: z.string().max(200) })
  .strict();

export async function signup(input: z.infer<typeof SignupInput>): Promise<SessionUser> {
  const passwordHash = await hashPassword(input.password);
  const [u] = await db
    .insert(users)
    .values({ email: input.email, name: input.name, passwordHash })
    .onConflictDoNothing({ target: users.email })
    .returning({ id: users.id, email: users.email, name: users.name, role: users.role });
  if (!u) throw conflict("email_taken");
  await createSession(u.id);
  return u;
}

export async function login(input: z.infer<typeof LoginInput>): Promise<SessionUser> {
  const [u] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
  // Always run a verify so response time doesn't reveal whether the email exists.
  const ok = await verifyPassword(u?.passwordHash ?? (await dummyHash()), input.password);
  if (!u || !ok) throw new AppError("invalid_credentials", 401);
  await createSession(u.id);
  return { id: u.id, email: u.email, name: u.name, role: u.role };
}
