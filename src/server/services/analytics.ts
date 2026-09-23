import "server-only";
import { and, count, desc, eq, gt, inArray, isNull, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { attempts, misconceptions, reviewItems, topicMastery } from "@/db/schema";
import { masteryScore, MIN_ATTEMPTS_FOR_DISPLAY } from "@/lib/engine/mastery";
import { recurringMisconceptions, signalBreakdown, weakTopics } from "@/lib/engine/recommendations";
import { syllabus, topicIndex } from "@/lib/syllabus";

export async function getAnalytics(userId: string, now = new Date()) {
  const mastery = await db.select().from(topicMastery).where(eq(topicMastery.userId, userId));
  const byTopic = new Map(mastery.map((m) => [m.topicId, m]));

  const subjects = syllabus.subjects.map((s) => {
    const units = s.units.map((u) => {
      const topics = u.topics.map((t) => {
        const m = byTopic.get(t.id);
        return {
          id: t.id,
          name: t.name,
          attempts: m?.attempts ?? 0,
          accuracy: m && m.attempts ? m.correct / m.attempts : null,
          mastery: m && m.attempts >= MIN_ATTEMPTS_FOR_DISPLAY ? masteryScore(m.theta) : null,
          avgTimeRatio: m?.avgTimeRatio ?? null,
        };
      });
      return { id: u.id, name: u.name, weight: u.weight, mastery: weightedMastery(u.topics.map((t) => byTopic.get(t.id))), topics };
    });
    return { id: s.id, name: s.name, mastery: weightedMastery(s.units.flatMap((u) => u.topics.map((t) => byTopic.get(t.id)))), units };
  });

  const recent = await db
    .select({ diagnosis: attempts.diagnosis, isCorrect: attempts.isCorrect, topicId: attempts.topicId, createdAt: attempts.createdAt, aiErrorType: attempts.aiAnalysis })
    .from(attempts)
    .where(eq(attempts.userId, userId))
    .orderBy(desc(attempts.createdAt))
    .limit(300);

  const since14 = new Date(now.getTime() - 14 * 86_400_000);
  const recurring = recurringMisconceptions(recent.filter((a) => a.createdAt > since14).map((a) => a.diagnosis.misconceptionId));
  const misRows = recurring.length
    ? await db.select().from(misconceptions).where(inArray(misconceptions.id, recurring.map((r) => r.misconceptionId)))
    : [];
  const misById = new Map(misRows.map((m) => [m.id, m]));

  const aiErrorTypes = new Map<string, number>();
  for (const a of recent) {
    const t = a.aiErrorType?.errorType;
    if (t && t !== "none") aiErrorTypes.set(t, (aiErrorTypes.get(t) ?? 0) + 1);
  }

  const [{ due }] = await db
    .select({ due: count() })
    .from(reviewItems)
    .where(and(eq(reviewItems.userId, userId), isNull(reviewItems.retiredAt), lte(reviewItems.dueAt, now)));

  const totalAttempts = mastery.reduce((a, m) => a + m.attempts, 0);
  const totalCorrect = mastery.reduce((a, m) => a + m.correct, 0);
  const last7 = recent.filter((a) => a.createdAt > new Date(now.getTime() - 7 * 86_400_000)).length;

  return {
    overall: { attempts: totalAttempts, accuracy: totalAttempts ? totalCorrect / totalAttempts : null, last7Days: last7, reviewDue: due },
    subjects,
    weakTopics: weakTopics(
      mastery.map((m) => {
        const t = topicIndex.get(m.topicId);
        return { topicId: m.topicId, weight: t ? t.unitWeight / t.unitTopicCount : 0, theta: m.theta, attempts: m.attempts };
      }),
    ).map((w) => ({ ...w, name: topicIndex.get(w.topicId)?.name ?? w.topicId, subjectId: topicIndex.get(w.topicId)?.subjectId })),
    signals: signalBreakdown(recent.map((a) => a.diagnosis.signal)),
    aiErrorTypes: [...aiErrorTypes.entries()].map(([type, n]) => ({ type, count: n })).sort((a, b) => b.count - a.count),
    misconceptions: recurring.map((r) => ({ ...r, description: misById.get(r.misconceptionId)?.description ?? "", remediation: misById.get(r.misconceptionId)?.remediation ?? "" })),
  };
}

function weightedMastery(rows: ({ theta: number; attempts: number } | undefined)[]): number | null {
  const seen = rows.filter((r): r is { theta: number; attempts: number } => !!r && r.attempts > 0);
  const n = seen.reduce((a, r) => a + r.attempts, 0);
  if (n < MIN_ATTEMPTS_FOR_DISPLAY) return null;
  return seen.reduce((a, r) => a + masteryScore(r.theta) * r.attempts, 0) / n;
}

export async function reviewStatus(userId: string, now = new Date()) {
  const [{ due }] = await db
    .select({ due: count() })
    .from(reviewItems)
    .where(and(eq(reviewItems.userId, userId), isNull(reviewItems.retiredAt), lte(reviewItems.dueAt, now)));
  const [next] = await db
    .select({ dueAt: reviewItems.dueAt })
    .from(reviewItems)
    .where(and(eq(reviewItems.userId, userId), isNull(reviewItems.retiredAt), gt(reviewItems.dueAt, now)))
    .orderBy(reviewItems.dueAt)
    .limit(1);
  return { dueCount: due, nextDueAt: next?.dueAt ?? null };
}
