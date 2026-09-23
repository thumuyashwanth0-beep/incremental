import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, type Tx } from "@/db/client";
import { attempts, misconceptions, practiceSessions, questions, reviewItems, topicMastery } from "@/db/schema";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { diagnose, type Confidence, type Diagnosis } from "@/lib/engine/diagnosis";
import { grade, type AttemptResponse } from "@/lib/engine/grade";
import { INITIAL_MASTERY, masteryScore, updateMastery } from "@/lib/engine/mastery";
import { applyReviewResult, newReview } from "@/lib/engine/review";
import type { Answer } from "@/lib/content/schema";
import { renderRich } from "@/lib/render/rich";
import { getOwnedSession } from "./practice";

export interface SubmitAttemptInput {
  sessionId: string;
  questionId: string;
  response: AttemptResponse;
  timeTakenMs: number;
  confidence?: Confidence;
  hintsUsed: number;
  working?: string;
}

export interface AttemptResult {
  attemptId: string;
  correct: boolean;
  answer: Answer;
  solution: string;
  solutionHtml: string;
  optionFeedback: { key: string; correct: boolean; whyWrong?: string; whyWrongHtml?: string; misconception?: string }[];
  diagnosis: Diagnosis;
  mastery: { topicId: string; before: number; after: number };
}

export async function submitAttempt(userId: string, input: SubmitAttemptInput, now = new Date()): Promise<AttemptResult> {
  const session = await getOwnedSession(userId, input.sessionId);
  // A question can only be answered while it's the session's current question.
  // This also stops students fetching keys for arbitrary question ids.
  if (session.currentQuestionId !== input.questionId) throw conflict("question_not_current");

  const [q] = await db.select().from(questions).where(eq(questions.id, input.questionId));
  if (!q) throw notFound();
  // Server-tracked hint count wins; the client value can only raise it.
  const hintsUsed = Math.min(q.hints.length, Math.max(input.hintsUsed, session.currentHintsUsed));
  if (input.response.kind === "choice" && q.type === "numerical") throw badRequest("response_kind_mismatch");
  if (input.response.kind === "numeric" && q.type !== "numerical") throw badRequest("response_kind_mismatch");

  // The server clock is the upper bound on time taken (the client value can't be trusted to be honest).
  const serverElapsed = session.currentServedAt ? now.getTime() - session.currentServedAt.getTime() : input.timeTakenMs;
  const timeTakenMs = Math.max(0, Math.min(input.timeTakenMs, serverElapsed + 2000));

  const correct = grade(q.answer, input.response);
  const misIds = q.options.flatMap((o) => (o.misconceptionId ? [o.misconceptionId] : []));
  const misRows = misIds.length ? await db.select().from(misconceptions).where(inArray(misconceptions.id, misIds)) : [];
  const misById = new Map(misRows.map((m) => [m.id, m]));

  const diagnosis = diagnose({
    correct,
    response: input.response,
    options: q.options,
    expectedTimeSec: q.expectedTimeSec,
    timeTakenMs,
    confidence: input.confidence,
    hintsUsed,
    remediations: Object.fromEntries(misRows.map((m) => [m.id, m.remediation])),
  });

  const result = await db.transaction(async (tx) => {
    // Claim the question: fails if a concurrent submit already answered it.
    const claimed = await tx
      .update(practiceSessions)
      .set({ currentQuestionId: null, currentServedAt: null, currentReviewItemId: null, currentHintsUsed: 0 })
      .where(and(eq(practiceSessions.id, session.id), eq(practiceSessions.currentQuestionId, q.id)))
      .returning({ id: practiceSessions.id });
    if (!claimed.length) throw conflict("question_not_current");

    const [attempt] = await tx
      .insert(attempts)
      .values({
        userId,
        sessionId: session.id,
        questionId: q.id,
        questionVersion: q.version,
        topicId: q.topicId,
        response: input.response,
        isCorrect: correct,
        timeTakenMs,
        confidence: input.confidence ?? null,
        hintsUsed,
        working: input.working?.trim() || null,
        diagnosis,
        createdAt: now,
      })
      .returning({ id: attempts.id });

    const upd = { correct, difficulty: q.difficulty, calibratedB: q.calibratedB, hintsUsed, timeRatio: diagnosis.timeRatio };
    const primary = await applyMastery(tx, userId, q.topicId, upd, 1, now);
    for (const t of q.secondaryTopicIds) await applyMastery(tx, userId, t, upd, 0.5, now);

    await scheduleReview(tx, userId, session.currentReviewItemId, q, diagnosis, correct, now);
    return { attemptId: attempt.id, primary };
  });

  const correctKeys = q.answer.kind === "choice" ? q.answer.keys : [];
  return {
    attemptId: result.attemptId,
    correct,
    answer: q.answer,
    solution: q.solution,
    solutionHtml: renderRich(q.solution),
    optionFeedback: q.options.map((o) => ({
      key: o.key,
      correct: (correctKeys as string[]).includes(o.key),
      whyWrong: o.whyWrong,
      whyWrongHtml: o.whyWrong ? renderRich(o.whyWrong) : undefined,
      misconception: o.misconceptionId ? misById.get(o.misconceptionId)?.description : undefined,
    })),
    diagnosis,
    mastery: { topicId: q.topicId, ...result.primary },
  };
}

async function applyMastery(
  tx: Tx,
  userId: string,
  topicId: string,
  input: Parameters<typeof updateMastery>[1],
  weight: number,
  now: Date,
) {
  const [row] = await tx
    .select()
    .from(topicMastery)
    .where(and(eq(topicMastery.userId, userId), eq(topicMastery.topicId, topicId)))
    .for("update");
  const before = row ?? INITIAL_MASTERY;
  const next = updateMastery(before, { ...input, weight });
  await tx
    .insert(topicMastery)
    .values({ userId, topicId, ...next, lastPracticedAt: now })
    .onConflictDoUpdate({ target: [topicMastery.userId, topicMastery.topicId], set: { ...next, lastPracticedAt: now } });
  return { before: masteryScore(before.theta), after: masteryScore(next.theta) };
}

async function scheduleReview(
  tx: Tx,
  userId: string,
  reviewItemId: string | null,
  q: typeof questions.$inferSelect,
  diagnosis: Diagnosis,
  correct: boolean,
  now: Date,
) {
  if (reviewItemId) {
    const [item] = await tx.select().from(reviewItems).where(and(eq(reviewItems.id, reviewItemId), eq(reviewItems.userId, userId)));
    if (!item) return;
    const next = applyReviewResult({ ...item, retired: false }, correct, now);
    await tx
      .update(reviewItems)
      .set({ intervalDays: next.intervalDays, successes: next.successes, lapses: next.lapses, dueAt: next.dueAt, retiredAt: next.retired ? now : null })
      .where(eq(reviewItems.id, item.id));
    return;
  }
  if (!diagnosis.scheduleReview) return;
  const r = newReview(now);
  await tx
    .insert(reviewItems)
    .values({ userId, questionId: q.id, topicId: q.topicId, misconceptionId: diagnosis.misconceptionId ?? null, dueAt: r.dueAt, intervalDays: r.intervalDays })
    .onConflictDoUpdate({
      target: [reviewItems.userId, reviewItems.questionId],
      set: { dueAt: r.dueAt, intervalDays: r.intervalDays, successes: 0, retiredAt: null, lapses: sql`${reviewItems.lapses} + 1` },
    });
}
