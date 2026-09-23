import { z } from "zod";

export const ERROR_TYPES = ["conceptual", "formula", "calculation", "sign", "units", "misread", "incomplete", "other", "none"] as const;

/** Structured output of the working analysis. Keep it flat and simple; structured outputs support a JSON-schema subset. */
export const WorkingAnalysisSchema = z.object({
  errorType: z.enum(ERROR_TYPES).describe("Main error category; 'none' if the working is correct."),
  firstWrongStep: z
    .string()
    .describe("Quote or paraphrase the first step in the student's working that is wrong. Empty string if none or no working."),
  explanation: z.string().describe("2-4 sentences, addressed to the student, explaining what went wrong and why."),
  improvementTips: z.array(z.string()).describe("1-3 concrete, actionable habits or checks for next time."),
  revisitTopicIds: z.array(z.string()).describe("Syllabus topic ids (from the provided list) the student should revisit. May be empty."),
  approachQuality: z
    .enum(["efficient", "valid_but_slow", "flawed", "unclear"])
    .describe("Quality of the overall method, independent of arithmetic slips."),
});
export type WorkingAnalysis = z.infer<typeof WorkingAnalysisSchema>;

/** Post-validation: clamp lengths and keep only real topic ids (model output is untrusted). */
export function sanitizeAnalysis(a: WorkingAnalysis, validTopicIds: ReadonlySet<string>): WorkingAnalysis {
  const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  return {
    errorType: a.errorType,
    approachQuality: a.approachQuality,
    firstWrongStep: clip(a.firstWrongStep, 500),
    explanation: clip(a.explanation, 1200),
    improvementTips: a.improvementTips.slice(0, 3).map((t) => clip(t, 300)),
    revisitTopicIds: [...new Set(a.revisitTopicIds)].filter((id) => validTopicIds.has(id)).slice(0, 3),
  };
}
