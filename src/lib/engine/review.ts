/** Spaced re-testing of missed questions. Model: docs/LEARNING_ENGINE.md §4. */

export interface ReviewState {
  intervalDays: number;
  successes: number;
  lapses: number;
  dueAt: Date;
  retired: boolean;
}

const DAY_MS = 86_400_000;
export const GROWTH = 2.5;
export const SUCCESSES_TO_RETIRE = 3;
export const STUCK_LAPSES = 3;

export function newReview(now: Date): ReviewState {
  return { intervalDays: 1, successes: 0, lapses: 0, dueAt: new Date(now.getTime() + DAY_MS), retired: false };
}

export function applyReviewResult(state: ReviewState, correct: boolean, now: Date): ReviewState {
  if (correct) {
    const successes = state.successes + 1;
    const intervalDays = state.successes === 0 ? GROWTH : state.intervalDays * GROWTH;
    return {
      intervalDays,
      successes,
      lapses: state.lapses,
      dueAt: new Date(now.getTime() + intervalDays * DAY_MS),
      retired: successes >= SUCCESSES_TO_RETIRE,
    };
  }
  return { intervalDays: 1, successes: 0, lapses: state.lapses + 1, dueAt: new Date(now.getTime() + DAY_MS), retired: false };
}

export function isStuck(state: Pick<ReviewState, "lapses">): boolean {
  return state.lapses >= STUCK_LAPSES;
}
