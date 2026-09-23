import type { Unit } from "./index";

/** Launch targets. Rationale: docs/DATA_STRATEGY.md §5. Keep the two in sync. */
export const TOPIC_MIN = 30;
export const UNIT_PER_WEIGHT = 80;
export const BAND_SHARE = { easy: 0.3, medium: 0.45, hard: 0.25 } as const;
export const MIN_NUMERICAL_SHARE = 0.2;
export const MOCK_RESERVE_TARGET = 20 * 75;

export type Band = keyof typeof BAND_SHARE;

export function bandOf(difficulty: number): Band {
  return difficulty <= 2 ? "easy" : difficulty === 3 ? "medium" : "hard";
}

export function unitTarget(unit: Pick<Unit, "weight" | "topics">): number {
  return Math.max(TOPIC_MIN * unit.topics.length, Math.ceil(UNIT_PER_WEIGHT * unit.weight));
}

/** Per-topic target: unit target split evenly, never below TOPIC_MIN. */
export function topicTarget(unit: Pick<Unit, "weight" | "topics">): number {
  return Math.max(TOPIC_MIN, Math.ceil(unitTarget(unit) / unit.topics.length));
}

export function bandTargets(total: number): Record<Band, number> {
  return {
    easy: Math.round(total * BAND_SHARE.easy),
    medium: Math.round(total * BAND_SHARE.medium),
    hard: total - Math.round(total * BAND_SHARE.easy) - Math.round(total * BAND_SHARE.medium),
  };
}
