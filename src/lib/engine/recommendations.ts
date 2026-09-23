/** Weak-topic ranking and error summaries. docs/LEARNING_ENGINE.md §6. */
import { masteryScore, MIN_ATTEMPTS_FOR_DISPLAY } from "./mastery";
import type { Signal } from "./diagnosis";

export interface TopicStat {
  topicId: string;
  weight: number;
  theta: number;
  attempts: number;
}

export interface WeakTopic {
  topicId: string;
  mastery: number;
  attempts: number;
  priority: number;
}

export function weakTopics(stats: TopicStat[], limit = 8): WeakTopic[] {
  return stats
    .filter((s) => s.attempts >= 3)
    .map((s) => {
      const mastery = masteryScore(s.theta);
      const confidence = Math.min(1, s.attempts / MIN_ATTEMPTS_FOR_DISPLAY);
      return { topicId: s.topicId, mastery, attempts: s.attempts, priority: s.weight * (1 - mastery) * confidence };
    })
    .filter((w) => w.mastery < 0.6)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, limit);
}

const MISTAKE_SIGNALS: Signal[] = ["misconception", "careless", "knowledge_gap", "error", "skipped"];

export function signalBreakdown(signals: Signal[]): { signal: Signal; count: number; share: number }[] {
  const mistakes = signals.filter((s) => MISTAKE_SIGNALS.includes(s));
  const counts = new Map<Signal, number>();
  for (const s of mistakes) counts.set(s, (counts.get(s) ?? 0) + 1);
  return [...counts.entries()]
    .map(([signal, count]) => ({ signal, count, share: count / mistakes.length }))
    .sort((a, b) => b.count - a.count);
}

export function recurringMisconceptions(ids: (string | undefined | null)[], minHits = 2) {
  const counts = new Map<string, number>();
  for (const id of ids) if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, n]) => n >= minHits)
    .map(([misconceptionId, count]) => ({ misconceptionId, count }))
    .sort((a, b) => b.count - a.count);
}
