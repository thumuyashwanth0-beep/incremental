import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { attempts, questionReports } from "@/db/schema";
import { notFound } from "@/lib/errors";

export type ReportReason = (typeof questionReports.$inferInsert)["reason"];

/** Students may only report questions they have attempted (prevents probing arbitrary ids). */
export async function reportQuestion(userId: string, questionId: string, reason: ReportReason, note?: string) {
  const [seen] = await db
    .select({ id: attempts.id })
    .from(attempts)
    .where(and(eq(attempts.userId, userId), eq(attempts.questionId, questionId)))
    .limit(1);
  if (!seen) throw notFound();
  await db
    .insert(questionReports)
    .values({ userId, questionId, reason, note: note?.trim() || null })
    .onConflictDoUpdate({ target: [questionReports.userId, questionReports.questionId], set: { reason, note: note?.trim() || null } });
}
