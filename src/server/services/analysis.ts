import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { aiUsage, attempts, questions } from "@/db/schema";
import { analyzeWorking, AiRefusalError, isRetryableAiError } from "@/lib/ai/analyze-working";
import type { WorkingAnalysis } from "@/lib/ai/schemas";
import { env } from "@/lib/env";
import { AppError, notFound, tooMany, unavailable } from "@/lib/errors";
import { syllabus, topicIndex } from "@/lib/syllabus";
import { formatAnswer } from "./questions";

export async function analyzeAttempt(userId: string, attemptId: string, newWorking?: string): Promise<WorkingAnalysis> {
  const [row] = await db
    .select({ attempt: attempts, question: questions })
    .from(attempts)
    .innerJoin(questions, eq(questions.id, attempts.questionId))
    .where(and(eq(attempts.id, attemptId), eq(attempts.userId, userId)));
  if (!row) throw notFound();
  const { attempt, question } = row;
  const working = newWorking?.trim() || attempt.working || "";
  if (attempt.aiAnalysis && working === (attempt.working ?? "")) return attempt.aiAnalysis;

  const e = env();
  if (!e.AI_ENABLED || !e.ANTHROPIC_API_KEY) throw unavailable("ai_disabled");
  await consumeQuota(userId, e.AI_DAILY_LIMIT);

  const r = attempt.response;
  const studentAnswer = r.kind === "choice" ? r.keys.join(", ") : r.kind === "numeric" ? String(r.value) : "(skipped)";
  let analysis: WorkingAnalysis;
  try {
    analysis = await analyzeWorking({
      model: e.AI_MODEL,
      question: { stem: question.stem, options: question.options, type: question.type },
      correctAnswer: formatAnswer(question),
      solution: question.solution,
      studentAnswer,
      isCorrect: attempt.isCorrect,
      working,
      topicChoices: topicChoicesFor(question.topicId),
    });
  } catch (err) {
    if (err instanceof AiRefusalError) throw new AppError("ai_refused", 422);
    if (isRetryableAiError(err)) throw unavailable("ai_busy");
    throw err;
  }
  await db
    .update(attempts)
    .set({ aiAnalysis: analysis, working: working || null })
    .where(and(eq(attempts.id, attempt.id), eq(attempts.userId, userId)));
  return analysis;
}

async function consumeQuota(userId: string, limit: number) {
  const day = new Date().toISOString().slice(0, 10);
  const [u] = await db
    .insert(aiUsage)
    .values({ userId, day, count: 1 })
    .onConflictDoUpdate({ target: [aiUsage.userId, aiUsage.day], set: { count: sql`${aiUsage.count} + 1` } })
    .returning({ count: aiUsage.count });
  if (u.count > limit) throw tooMany("ai_quota_exceeded");
}

/** Topics the model may suggest: the question's whole unit plus Class 11 foundations of the same subject. */
function topicChoicesFor(topicId: string) {
  const t = topicIndex.get(topicId);
  if (!t) return [];
  const subject = syllabus.subjects.find((s) => s.id === t.subjectId)!;
  return subject.units
    .filter((u) => u.id === t.unitId || u.class === 11)
    .flatMap((u) => u.topics.map((x) => ({ id: x.id, name: `${u.name}: ${x.name}` })));
}
