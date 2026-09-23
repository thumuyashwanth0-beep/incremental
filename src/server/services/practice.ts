import "server-only";
import { createHash } from "node:crypto";
import { and, asc, eq, gt, isNull, lte, ne, notInArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { attempts, practiceSessions, questions, reviewItems, topicMastery } from "@/db/schema";
import { notFound } from "@/lib/errors";
import { pickQuestion, pickTopic, seededRng, type TopicCandidate } from "@/lib/engine/selection";
import { renderRich } from "@/lib/render/rich";
import { getTopic, topicIndex, type SubjectId } from "@/lib/syllabus";
import { servableFilter, toPublicQuestion, type PublicQuestion, type QuestionRow } from "./questions";

export type StartSessionInput =
  | { mode: "topic"; topicId: string }
  | { mode: "adaptive"; subjectId?: SubjectId }
  | { mode: "review" };

const SESSION_LENGTH = 10;
const RECENT_DAYS = 14;
const REVIEW_SHARE_ADAPTIVE = 0.3;

export async function startSession(userId: string, input: StartSessionInput) {
  if (input.mode === "topic" && !getTopic(input.topicId)) throw notFound("unknown_topic");
  const [s] = await db
    .insert(practiceSessions)
    .values({
      userId,
      mode: input.mode,
      topicId: input.mode === "topic" ? input.topicId : null,
      subject: input.mode === "adaptive" ? (input.subjectId ?? null) : input.mode === "topic" ? getTopic(input.topicId)!.subjectId : null,
      targetCount: SESSION_LENGTH,
    })
    .returning();
  return s;
}

export async function getOwnedSession(userId: string, sessionId: string) {
  const [s] = await db
    .select()
    .from(practiceSessions)
    .where(and(eq(practiceSessions.id, sessionId), eq(practiceSessions.userId, userId)))
    .limit(1);
  if (!s) throw notFound("session_not_found");
  return s;
}

export type NextResult =
  | { done: false; question: PublicQuestion; position: number; total: number; isReview: boolean }
  | { done: true; total: number };

/** Serves the session's current question, choosing a new one if none is pending. */
export async function nextQuestion(userId: string, sessionId: string, now = new Date()): Promise<NextResult> {
  const s = await getOwnedSession(userId, sessionId);
  if (s.currentQuestionId) {
    const [q] = await db.select().from(questions).where(eq(questions.id, s.currentQuestionId));
    return { done: false, question: toPublicQuestion(q), position: s.servedCount, total: s.targetCount, isReview: !!s.currentReviewItemId };
  }
  if (s.endedAt || s.servedCount >= s.targetCount) return finish(s.id, s.targetCount, s.endedAt);

  const rng = seededRng(seedFrom(s.id, s.servedCount));
  const recent = await recentlySeen(userId, now);

  let picked: { q: QuestionRow; reviewItemId?: string } | undefined;
  const wantReview = s.mode === "review" || (s.mode === "adaptive" && rng() < REVIEW_SHARE_ADAPTIVE);
  if (wantReview) picked = await pickReview(userId, recent, now, s.subject as SubjectId | null);
  if (!picked && s.mode !== "review") {
    const q = s.mode === "topic" ? await pickFromTopic(userId, s.topicId!, recent, rng) : await pickAdaptive(userId, s.subject as SubjectId | null, recent, rng);
    if (q) picked = { q };
  }
  if (!picked) return finish(s.id, s.servedCount, s.endedAt);

  // Only claim the slot if nothing else did in the meantime (double-click / two tabs).
  const updated = await db
    .update(practiceSessions)
    .set({
      currentQuestionId: picked.q.id,
      currentServedAt: now,
      currentReviewItemId: picked.reviewItemId ?? null,
      currentHintsUsed: 0,
      servedCount: sql`${practiceSessions.servedCount} + 1`,
    })
    .where(and(eq(practiceSessions.id, s.id), isNull(practiceSessions.currentQuestionId)))
    .returning({ servedCount: practiceSessions.servedCount });
  if (!updated.length) return nextQuestion(userId, sessionId, now);
  return { done: false, question: toPublicQuestion(picked.q), position: updated[0].servedCount, total: s.targetCount, isReview: !!picked.reviewItemId };
}

async function finish(sessionId: string, total: number, endedAt: Date | null): Promise<NextResult> {
  if (!endedAt) await db.update(practiceSessions).set({ endedAt: new Date() }).where(eq(practiceSessions.id, sessionId));
  return { done: true, total };
}

function seedFrom(id: string, n: number): number {
  return createHash("sha256").update(`${id}:${n}`).digest().readUInt32LE(0);
}

async function recentlySeen(userId: string, now: Date): Promise<string[]> {
  const since = new Date(now.getTime() - RECENT_DAYS * 86_400_000);
  const rows = await db
    .selectDistinct({ id: attempts.questionId })
    .from(attempts)
    .where(and(eq(attempts.userId, userId), gt(attempts.createdAt, since)));
  return rows.map((r) => r.id);
}

async function thetaFor(userId: string, topicId: string): Promise<number> {
  const [m] = await db
    .select({ theta: topicMastery.theta })
    .from(topicMastery)
    .where(and(eq(topicMastery.userId, userId), eq(topicMastery.topicId, topicId)));
  return m?.theta ?? 0;
}

async function pickFromTopic(userId: string, topicId: string, recent: string[], rng: () => number) {
  const base = and(servableFilter(), eq(questions.topicId, topicId));
  let pool = await db
    .select()
    .from(questions)
    .where(recent.length ? and(base, notInArray(questions.id, recent)) : base);
  // Everything seen recently: allow repeats rather than ending the session early.
  if (!pool.length) pool = await db.select().from(questions).where(base);
  return pickQuestion(await thetaFor(userId, topicId), pool, rng);
}

async function pickAdaptive(userId: string, subject: SubjectId | null, recent: string[], rng: () => number) {
  const availability = await db
    .select({ topicId: questions.topicId, n: sql<number>`count(*)::int` })
    .from(questions)
    .where(recent.length ? and(servableFilter(), notInArray(questions.id, recent)) : servableFilter())
    .groupBy(questions.topicId);
  const mastery = new Map(
    (await db.select().from(topicMastery).where(eq(topicMastery.userId, userId))).map((m) => [m.topicId, m]),
  );
  const candidates: TopicCandidate[] = availability.flatMap(({ topicId, n }) => {
    const t = topicIndex.get(topicId);
    if (!t || (subject && t.subjectId !== subject)) return [];
    const m = mastery.get(topicId);
    return [{ topicId, weight: t.unitWeight / t.unitTopicCount, theta: m?.theta ?? 0, attempts: m?.attempts ?? 0, available: n }];
  });
  const topicId = pickTopic(candidates, rng);
  return topicId ? pickFromTopic(userId, topicId, recent, rng) : undefined;
}

/** Due review item → a sibling question (same topic and misconception) if one exists, else the original. */
async function pickReview(userId: string, recent: string[], now: Date, subject: SubjectId | null) {
  const due = await db
    .select()
    .from(reviewItems)
    .where(and(eq(reviewItems.userId, userId), isNull(reviewItems.retiredAt), lte(reviewItems.dueAt, now)))
    .orderBy(asc(reviewItems.dueAt))
    .limit(20);
  const item = due.find((d) => !subject || topicIndex.get(d.topicId)?.subjectId === subject);
  if (!item) return undefined;

  const exclude = [...new Set([...recent, item.questionId])];
  const conds = [servableFilter(), eq(questions.topicId, item.topicId), notInArray(questions.id, exclude)];
  if (item.misconceptionId)
    conds.push(sql`${questions.options} @> ${JSON.stringify([{ misconceptionId: item.misconceptionId }])}::jsonb`);
  let [q] = await db.select().from(questions).where(and(...conds)).limit(1);
  if (!q && item.misconceptionId) {
    [q] = await db
      .select()
      .from(questions)
      .where(and(servableFilter(), eq(questions.topicId, item.topicId), notInArray(questions.id, exclude)))
      .limit(1);
  }
  if (!q) [q] = await db.select().from(questions).where(and(eq(questions.id, item.questionId), ne(questions.status, "retired")));
  return q ? { q, reviewItemId: item.id } : undefined;
}

/** Reveals hint n (1-based) of the current question and records it server-side. */
export async function revealHint(userId: string, sessionId: string, n: number) {
  const s = await getOwnedSession(userId, sessionId);
  if (!s.currentQuestionId) throw notFound("no_current_question");
  const [q] = await db.select({ hints: questions.hints }).from(questions).where(eq(questions.id, s.currentQuestionId));
  if (!q || n < 1 || n > q.hints.length) throw notFound("no_such_hint");
  if (n > s.currentHintsUsed)
    await db.update(practiceSessions).set({ currentHintsUsed: n }).where(and(eq(practiceSessions.id, s.id), eq(practiceSessions.currentQuestionId, s.currentQuestionId)));
  return { n, html: renderRich(q.hints[n - 1]), total: q.hints.length };
}
