import { z } from "zod";

/**
 * Content schema: the single source of truth for question files in content/questions/**.
 * The DB mirrors these fields (src/db/schema.ts). See docs/DATA_STRATEGY.md §1.
 */

export const QUESTION_SOURCES = ["original", "ai_generated", "jeebench", "pw25", "nta"] as const;
export const QUESTION_STATUSES = ["draft", "auto_verified", "in_review", "published", "retired"] as const;
export const QUESTION_TYPES = ["single", "multi", "numerical"] as const;
export const OPTION_KEYS = ["A", "B", "C", "D"] as const;

export const TopicId = z.string().regex(/^(phy|chem|math)\.[a-z0-9-]+\.[a-z0-9-]+$/, "bad topic id");
export const MisconceptionId = z.string().regex(/^(phy|chem|math)\.[a-z0-9.-]+$/, "bad misconception id");

const RichText = z.string().min(1).max(8000);

export const OptionSchema = z
  .object({
    key: z.enum(OPTION_KEYS),
    text: RichText.max(1000),
    misconceptionId: MisconceptionId.optional(),
    whyWrong: z.string().max(1000).optional(),
  })
  .strict();

export const AnswerSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("choice"), keys: z.array(z.enum(OPTION_KEYS)).min(1).max(4) }).strict(),
  z
    .object({
      kind: z.literal("numeric"),
      value: z.number().finite(),
      /** Absolute tolerance. 0 for integer answers. */
      tolerance: z.number().min(0).default(0),
    })
    .strict(),
]);

export const QuestionSchema = z
  .object({
    externalId: z.string().regex(/^[a-z0-9]+:[A-Za-z0-9._:-]+$/, "externalId must be <source>:<id>").max(200),
    topicId: TopicId,
    secondaryTopicIds: z.array(TopicId).max(3).default([]),
    type: z.enum(QUESTION_TYPES),
    stem: RichText,
    options: z.array(OptionSchema).default([]),
    answer: AnswerSchema,
    solution: RichText,
    hints: z.array(z.string().min(1).max(1000)).max(3).default([]),
    difficulty: z.number().int().min(1).max(5),
    expectedTimeSec: z.number().int().min(20).max(900),
    skills: z.array(z.string().regex(/^[a-z-]+$/)).max(6).default([]),
    source: z.enum(QUESTION_SOURCES),
    sourceRef: z.string().min(1).max(500),
    license: z.string().min(1).max(100),
    status: z.enum(QUESTION_STATUSES),
    /** Reserved for mock tests: never served in practice. */
    mockReserve: z.boolean().default(false),
    reviewNotes: z.string().max(2000).optional(),
  })
  .strict()
  .superRefine((q, ctx) => {
    const issue = (message: string, path: (string | number)[] = []) =>
      ctx.addIssue({ code: "custom", message, path });

    if (q.type === "numerical") {
      if (q.options.length) issue("numerical questions must not have options", ["options"]);
      if (q.answer.kind !== "numeric") issue("numerical questions need a numeric answer", ["answer"]);
      return;
    }
    if (q.answer.kind !== "choice") return issue("choice questions need a choice answer", ["answer"]);
    const keys = q.options.map((o) => o.key);
    if (keys.join("") !== "ABCD") issue("options must be exactly A, B, C, D in order", ["options"]);
    const texts = new Set(q.options.map((o) => o.text.trim().toLowerCase()));
    if (texts.size !== q.options.length) issue("duplicate option text", ["options"]);
    if (q.type === "single" && q.answer.keys.length !== 1) issue("single-correct needs exactly one key", ["answer"]);
    for (const k of q.answer.keys) if (!keys.includes(k)) issue(`answer key ${k} not in options`, ["answer"]);
    // Every wrong option should explain itself. Required for published originals, which we control.
    const correctKeys = q.answer.keys;
    if (q.source === "original" || q.source === "ai_generated") {
      q.options.forEach((o, i) => {
        const wrong = !correctKeys.includes(o.key);
        if (wrong && !o.misconceptionId && !o.whyWrong)
          issue(`wrong option ${o.key} needs misconceptionId or whyWrong`, ["options", i]);
      });
    }
  });

export type Question = z.infer<typeof QuestionSchema>;
export type QuestionInput = z.input<typeof QuestionSchema>;
export type Answer = z.infer<typeof AnswerSchema>;
export type OptionKey = (typeof OPTION_KEYS)[number];

export const QuestionFileSchema = z.object({ questions: z.array(z.unknown()) }).strict();

export const MisconceptionSchema = z
  .object({
    id: MisconceptionId,
    topicId: TopicId,
    description: z.string().min(5).max(500),
    remediation: z.string().min(5).max(1500),
  })
  .strict();
export type Misconception = z.infer<typeof MisconceptionSchema>;
export const MisconceptionFileSchema = z.object({ misconceptions: z.array(MisconceptionSchema) }).strict();

/**
 * Staging format for external datasets (content/questions/_imports/<source>.json).
 * Missing topic/solution/difficulty; filled in by scripts/enrich-imports.ts.
 */
export const ImportedQuestionSchema = z
  .object({
    externalId: z.string().regex(/^[a-z0-9]+:[A-Za-z0-9._:-]+$/),
    subject: z.enum(["phy", "chem", "math"]),
    type: z.enum(QUESTION_TYPES),
    stem: RichText,
    options: z.array(z.object({ key: z.enum(OPTION_KEYS), text: z.string().min(1).max(1000) }).strict()).default([]),
    answer: AnswerSchema,
    source: z.enum(QUESTION_SOURCES),
    sourceRef: z.string().min(1).max(500),
    license: z.string().min(1).max(100),
  })
  .strict();
export type ImportedQuestion = z.infer<typeof ImportedQuestionSchema>;
