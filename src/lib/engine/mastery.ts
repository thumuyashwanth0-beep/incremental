/** Elo/Rasch-style topic mastery. Model: docs/LEARNING_ENGINE.md §2. */

export interface MasteryState {
  theta: number;
  attempts: number;
  correct: number;
  avgTimeRatio: number;
}

export const INITIAL_MASTERY: MasteryState = { theta: 0, attempts: 0, correct: 0, avgTimeRatio: 1 };

export const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/** Difficulty 1..5 → logit −2..+2. A calibrated b from data wins when available. */
export function difficultyToLogit(difficulty: number, calibratedB?: number | null): number {
  if (calibratedB != null) return calibratedB;
  return (Math.min(5, Math.max(1, difficulty)) - 3);
}

export function expectedCorrect(theta: number, b: number): number {
  return sigmoid(theta - b);
}

export function learningRate(attempts: number): number {
  return Math.max(0.15, 0.6 / Math.sqrt(1 + attempts / 5));
}

export interface MasteryUpdateInput {
  correct: boolean;
  difficulty: number;
  calibratedB?: number | null;
  hintsUsed: number;
  timeRatio: number;
  /** 1 for the primary topic, 0.5 for secondary topics. */
  weight?: number;
}

const THETA_BOUND = 4;

export function updateMastery(state: MasteryState, input: MasteryUpdateInput): MasteryState {
  const b = difficultyToLogit(input.difficulty, input.calibratedB);
  const p = expectedCorrect(state.theta, b);
  const credit = input.correct ? (input.hintsUsed > 0 ? 0.6 : 1) : 0;
  const k = learningRate(state.attempts) * (input.weight ?? 1);
  const theta = Math.max(-THETA_BOUND, Math.min(THETA_BOUND, state.theta + k * (credit - p)));
  const attempts = state.attempts + 1;
  const ratio = Math.min(input.timeRatio, 5); // cap outliers (student walked away)
  return {
    theta,
    attempts,
    correct: state.correct + (input.correct ? 1 : 0),
    avgTimeRatio: state.avgTimeRatio + (ratio - state.avgTimeRatio) / attempts,
  };
}

/** 0..1, anchored so 50% ≈ reliably solves medium-hard (difficulty 3.5) questions. */
export function masteryScore(theta: number): number {
  return sigmoid(theta - 0.5);
}

export const MIN_ATTEMPTS_FOR_DISPLAY = 5;
