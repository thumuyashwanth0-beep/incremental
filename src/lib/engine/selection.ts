/** Adaptive question selection. Model: docs/LEARNING_ENGINE.md §3. Pure: rng is injected. */
import { difficultyToLogit, masteryScore } from "./mastery";

export type Rng = () => number;

/** Deterministic PRNG (mulberry32) so sessions and tests are reproducible. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface TopicCandidate {
  topicId: string;
  /** Unit weight split across its topics. */
  weight: number;
  theta: number;
  attempts: number;
  /** Number of servable questions not recently seen. Topics with 0 are skipped. */
  available: number;
}

export function topicPriority(c: TopicCandidate): number {
  const gap = 1 - masteryScore(c.theta);
  const exploration = c.attempts === 0 ? 0.5 : 1 / (1 + c.attempts);
  return c.weight * gap + 0.1 * c.weight * exploration;
}

export function pickTopic(candidates: TopicCandidate[], rng: Rng): string | undefined {
  const pool = candidates.filter((c) => c.available > 0);
  const total = pool.reduce((s, c) => s + topicPriority(c), 0);
  if (!pool.length || total <= 0) return pool[0]?.topicId;
  let r = rng() * total;
  for (const c of pool) {
    r -= topicPriority(c);
    if (r <= 0) return c.topicId;
  }
  return pool[pool.length - 1].topicId;
}

export const TARGET_SUCCESS = 0.7;

/** Question difficulty (logit) whose predicted success is TARGET_SUCCESS. */
export function targetDifficulty(theta: number): number {
  return theta - Math.log(TARGET_SUCCESS / (1 - TARGET_SUCCESS));
}

export interface QuestionCandidate {
  id: string;
  difficulty: number;
  calibratedB?: number | null;
}

export function pickQuestion<T extends QuestionCandidate>(theta: number, candidates: T[], rng: Rng): T | undefined {
  if (!candidates.length) return undefined;
  const target = targetDifficulty(theta);
  const scored = candidates.map((q) => ({ q, d: Math.abs(difficultyToLogit(q.difficulty, q.calibratedB) - target) }));
  const best = Math.min(...scored.map((s) => s.d));
  // Accept anything within half a logit of the best, to keep variety.
  const near = scored.filter((s) => s.d <= best + 0.5);
  return near[Math.floor(rng() * near.length)].q;
}
