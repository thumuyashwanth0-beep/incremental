/**
 * Claude-powered content pipeline: generate original questions, enrich imported ones, and
 * independently re-solve every question (without the key) to verify it. See docs/DATA_STRATEGY.md §4.
 * Used by CLI scripts only.
 */
import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { anthropic, FALLBACK_BETA } from "./client";

const OptKey = z.enum(["A", "B", "C", "D"]);

export const GeneratedQuestionSchema = z.object({
  type: z.enum(["single", "numerical"]),
  stem: z.string().describe("Markdown with $...$ LaTeX. Self-contained, no figures, states g and any constants needed."),
  options: z
    .array(
      z.object({
        key: OptKey,
        text: z.string(),
        misconceptionId: z.string().nullable().describe("Existing or newly proposed misconception id for a WRONG option; null for the correct option."),
        whyWrong: z.string().nullable().describe("One sentence: which mistake produces this option. null for the correct option."),
      }),
    )
    .describe("Exactly 4 options A-D for single; empty array for numerical."),
  answerKey: OptKey.nullable().describe("Correct option for single; null for numerical."),
  numericAnswer: z.number().nullable().describe("Exact answer for numerical; null for single."),
  tolerance: z.number().describe("Absolute tolerance for numerical (0 for integers); 0 for single."),
  solution: z.string().describe("Key idea first, then numbered steps, final answer in bold."),
  hints: z.array(z.string()).describe("1-3 progressive hints that do not reveal the answer."),
  difficulty: z.number().int().describe("1-5 on the JEE Main scale."),
  expectedTimeSec: z.number().int(),
  skills: z.array(z.string()),
});
export type GeneratedQuestion = z.infer<typeof GeneratedQuestionSchema>;

const GenerationSchema = z.object({
  questions: z.array(GeneratedQuestionSchema),
  newMisconceptions: z
    .array(z.object({ id: z.string(), description: z.string(), remediation: z.string() }))
    .describe("Misconceptions referenced by options that are not in the provided list."),
});

const GEN_SYSTEM = `You write original JEE Main practice questions for an Indian exam-prep app.
Rules:
- Strictly within the NTA JEE Main syllabus for the given topic. NCERT notation, SI units.
- Original problems only. Never reproduce questions from coaching books, websites or past papers.
- No figures or diagrams; every question must be solvable from text alone, without a calculator.
- Choose numbers so the correct answer is clean.
- Single-correct: exactly one defensible answer. Each wrong option must be the result of a specific, common student mistake,
  tagged with a misconceptionId (reuse the provided ones when they fit; otherwise propose "<topicId>.<kebab-case>") and a one-sentence whyWrong.
- Numerical: the stem must say what unit and rounding to use.
- Solutions: key idea first, then short numbered steps. Hints are progressive and never give the answer away.
- Double-check every answer by recomputing it before you output it.`;

export interface GenerateArgs {
  model: string;
  topic: { id: string; name: string; unitName: string; subjectName: string };
  count: number;
  mix: string;
  misconceptions: { id: string; description: string }[];
  exemplars: string[];
}

export async function generateQuestions(a: GenerateArgs) {
  const user = `Topic: ${a.topic.subjectName} → ${a.topic.unitName} → ${a.topic.name} (topicId: ${a.topic.id})
Write ${a.count} new questions. Required mix: ${a.mix}.

Existing misconceptions for this topic:
${a.misconceptions.map((m) => `- ${m.id}: ${m.description}`).join("\n") || "(none yet)"}

Existing questions (for style only; do NOT duplicate them):
${a.exemplars.map((e, i) => `${i + 1}. ${e}`).join("\n") || "(none yet)"}`;

  const res = await anthropic().beta.messages.parse({
    model: a.model,
    max_tokens: 16000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: betaZodOutputFormat(GenerationSchema) },
    system: GEN_SYSTEM,
    messages: [{ role: "user", content: user }],
  });
  if (!res.parsed_output) throw new Error(`generation failed: stop_reason=${res.stop_reason}`);
  return { ...res.parsed_output, usage: res.usage };
}

const SolveSchema = z.object({
  answerKey: OptKey.nullable().describe("Your chosen option for multiple-choice; null for numerical."),
  numericAnswer: z.number().nullable().describe("Your numeric answer for numerical questions; null otherwise."),
  ambiguous: z.boolean().describe("True if more than one option is defensible, data is missing, or the stem is unclear."),
  outOfSyllabus: z.boolean(),
  needsFigure: z.boolean(),
  issues: z.string().describe("Short notes on any problem found; empty string if none."),
});
export type SolveResult = z.infer<typeof SolveSchema>;

const SOLVE_SYSTEM = `You are a meticulous JEE examiner. Solve the question independently and carefully, checking arithmetic twice.
Then report your answer and flag any problem: ambiguity, missing data, more than one defensible option, out of JEE Main syllabus, or reliance on a figure.`;

/** Independent solve: the model never sees the key. */
export async function solveIndependently(model: string, q: { type: string; stem: string; options: { key: string; text: string }[] }) {
  const content = `${q.stem}\n\n${q.options.map((o) => `(${o.key}) ${o.text}`).join("\n")}\n\nQuestion type: ${q.type === "numerical" ? "numerical answer" : q.type === "multi" ? "one or more options correct (give the first)" : "single correct option"}`;
  const res = await anthropic().beta.messages.parse({
    model,
    max_tokens: 16000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: betaZodOutputFormat(SolveSchema) },
    system: SOLVE_SYSTEM,
    messages: [{ role: "user", content }],
  });
  if (!res.parsed_output) throw new Error(`solve failed: stop_reason=${res.stop_reason}`);
  return { ...res.parsed_output, usage: res.usage };
}

/** Does an independent solve agree with the key? Numeric: within max(tolerance, 1%). */
export function solveAgrees(
  answer: { kind: "choice"; keys: string[] } | { kind: "numeric"; value: number; tolerance: number },
  s: SolveResult,
): boolean {
  if (s.ambiguous || s.outOfSyllabus || s.needsFigure) return false;
  if (answer.kind === "choice") return s.answerKey !== null && answer.keys.includes(s.answerKey);
  if (s.numericAnswer === null) return false;
  const tol = Math.max(answer.tolerance, Math.abs(answer.value) * 0.01, 1e-9);
  return Math.abs(s.numericAnswer - answer.value) <= tol;
}

const EnrichSchema = z.object({
  topicId: z.string().describe("Best matching topic id from the provided list."),
  difficulty: z.number().int().describe("1-5 on the JEE Main scale (JEE Advanced questions are usually 4-5)."),
  expectedTimeSec: z.number().int(),
  solution: z.string().describe("Key idea first, then numbered steps, ending in the official answer in bold."),
  hints: z.array(z.string()),
  optionNotes: z.array(z.object({ key: OptKey, whyWrong: z.string() })).describe("For each WRONG option, the mistake that produces it."),
  skills: z.array(z.string()),
});
export type Enrichment = z.infer<typeof EnrichSchema>;

export async function enrichImported(
  model: string,
  q: { stem: string; options: { key: string; text: string }[]; officialAnswer: string; type: string },
  topics: { id: string; name: string }[],
) {
  const content = `Official question (${q.type}):
${q.stem}
${q.options.map((o) => `(${o.key}) ${o.text}`).join("\n")}

Official answer: ${q.officialAnswer}

Topic list (choose one id):
${topics.map((t) => `${t.id}: ${t.name}`).join("\n")}`;
  const res = await anthropic().beta.messages.parse({
    model,
    max_tokens: 16000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: betaZodOutputFormat(EnrichSchema) },
    system:
      "You prepare official JEE questions for a practice app: classify the topic, write a clear worked solution that reaches the OFFICIAL answer, give progressive hints, and explain what mistake leads to each wrong option. If you cannot reach the official answer, say so explicitly in the solution's first line starting with 'KEY-MISMATCH:'.",
    messages: [{ role: "user", content }],
  });
  if (!res.parsed_output) throw new Error(`enrich failed: stop_reason=${res.stop_reason}`);
  return { ...res.parsed_output, usage: res.usage };
}
