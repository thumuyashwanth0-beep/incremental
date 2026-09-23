import type { OptionKey } from "@/lib/content/schema";
import type { AttemptResponse } from "./grade";

export type Confidence = "sure" | "unsure" | "guess";
export type TimeFlag = "rushed" | "normal" | "slow";
export type Signal =
  | "solid"
  | "inefficient"
  | "fragile"
  | "misconception"
  | "careless"
  | "knowledge_gap"
  | "error"
  | "skipped";

export interface DiagnosisOption {
  key: OptionKey;
  misconceptionId?: string;
  whyWrong?: string;
}

export interface DiagnosisInput {
  correct: boolean;
  response: AttemptResponse;
  options: DiagnosisOption[];
  expectedTimeSec: number;
  timeTakenMs: number;
  confidence?: Confidence;
  hintsUsed: number;
  /** Remediation text by misconception id, for tip generation. */
  remediations?: Record<string, string>;
}

export interface Diagnosis {
  outcome: "correct" | "incorrect" | "skipped";
  signal: Signal;
  timeFlag: TimeFlag;
  timeRatio: number;
  misconceptionId?: string;
  whyWrong?: string;
  tips: string[];
  /** Whether this attempt should enter the spaced-review queue. */
  scheduleReview: boolean;
}

export const RUSHED_RATIO = 0.35;
export const SLOW_RATIO = 2;

export function timeFlagFor(ratio: number): TimeFlag {
  if (ratio < RUSHED_RATIO) return "rushed";
  if (ratio > SLOW_RATIO) return "slow";
  return "normal";
}

const TIPS: Record<Signal, string> = {
  solid: "Well done. This topic looks secure at this level.",
  inefficient:
    "Correct, but slower than exam pace. Compare your method with the solution and look for a shortcut (symmetry, conservation law, elimination of options).",
  fragile:
    "Correct, but you weren't sure. We'll bring back a similar question soon to make it stick.",
  misconception:
    "You were confident but wrong, which usually means a mistaken belief rather than a slip. Read the explanation for the option you picked carefully.",
  careless:
    "You answered much faster than this question needs. Re-read the question, underline what is asked, and check units and signs before submitting.",
  knowledge_gap: "This looks new to you. Study the solution, then try the hint-first approach on the next one.",
  error: "Not quite. Check the explanation for your option and the worked solution.",
  skipped: "Skipped. Look at the hints and solution; we'll bring a similar question back later.",
};

export function diagnose(input: DiagnosisInput): Diagnosis {
  const timeRatio = input.timeTakenMs / 1000 / input.expectedTimeSec;
  const timeFlag = timeFlagFor(timeRatio);
  const { correct, confidence, response } = input;

  let chosen: DiagnosisOption | undefined;
  if (!correct && response.kind === "choice") {
    // For single-choice the first key is the pick; for multi, the first wrong key carries the diagnosis.
    chosen = response.keys
      .map((k) => input.options.find((o) => o.key === k))
      .find((o) => o && (o.misconceptionId || o.whyWrong));
  }

  let signal: Signal;
  if (response.kind === "skip") signal = "skipped";
  else if (correct) {
    if (confidence === "guess" || confidence === "unsure" || input.hintsUsed > 0) signal = "fragile";
    else if (timeFlag === "slow") signal = "inefficient";
    else signal = "solid";
  } else if (confidence === "sure") signal = "misconception";
  else if (timeFlag === "rushed") signal = "careless";
  else if (confidence === "guess") signal = "knowledge_gap";
  else signal = "error";

  const tips = [TIPS[signal]];
  const remediation = chosen?.misconceptionId && input.remediations?.[chosen.misconceptionId];
  if (remediation) tips.push(remediation);
  if (correct && timeFlag === "slow" && signal !== "inefficient") tips.push(TIPS.inefficient);

  return {
    outcome: response.kind === "skip" ? "skipped" : correct ? "correct" : "incorrect",
    signal,
    timeFlag,
    timeRatio: Math.round(timeRatio * 100) / 100,
    misconceptionId: chosen?.misconceptionId,
    whyWrong: chosen?.whyWrong,
    tips,
    scheduleReview: signal !== "solid" && signal !== "inefficient",
  };
}
