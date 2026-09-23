import type { Answer, OptionKey } from "@/lib/content/schema";

export type AttemptResponse =
  | { kind: "choice"; keys: OptionKey[] }
  | { kind: "numeric"; value: number }
  | { kind: "skip" };

/** Decides correctness from the answer key alone. The AI never grades. */
export function grade(answer: Answer, response: AttemptResponse): boolean {
  if (response.kind === "skip") return false;
  if (answer.kind === "choice") {
    if (response.kind !== "choice") return false;
    const want = [...answer.keys].sort().join("");
    const got = [...new Set(response.keys)].sort().join("");
    return want === got;
  }
  if (response.kind !== "numeric" || !Number.isFinite(response.value)) return false;
  // Small epsilon absorbs float noise when tolerance is 0 (integer answers).
  return Math.abs(response.value - answer.value) <= answer.tolerance + 1e-9;
}
