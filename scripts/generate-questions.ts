/**
 * AI generation + independent verification for one topic.
 *   npm run content:generate -- --topic phy.kinematics.projectile --count 10 [--dry-run]
 * Writes to content/questions/<subject>/<unit>.json; status auto_verified or draft (+ reviewNotes).
 * Pipeline and publish policy: docs/DATA_STRATEGY.md §4.
 */
import "dotenv/config";
import { parseArgs } from "node:util";
import { createHash } from "node:crypto";
import { generateQuestions, solveAgrees, solveIndependently } from "../src/lib/ai/content-pipeline";
import { QuestionSchema, type QuestionInput } from "../src/lib/content/schema";
import { latexErrors } from "../src/lib/content/validate";
import { getTopic, unitIndex } from "../src/lib/syllabus";
import { bandOf, topicTarget } from "../src/lib/syllabus/targets";
import { appendMisconceptions, appendQuestions, estimateUsd, readMisconceptions, readTopicQuestions } from "./lib/content-files";

const { values } = parseArgs({
  options: { topic: { type: "string" }, count: { type: "string", default: "10" }, "dry-run": { type: "boolean", default: false } },
});
const topic = values.topic && getTopic(values.topic);
if (!topic) {
  console.error("usage: --topic <topicId from content/syllabus/jee-main.json> [--count N] [--dry-run]");
  process.exit(1);
}
const count = Math.min(50, Math.max(1, Number(values.count)));
const model = process.env.AI_MODEL || "claude-opus-5";
const BATCH = 5; // questions per generation call keeps outputs well under max_tokens

const existing = readTopicQuestions(topic.id);
const bands = { easy: 0, medium: 0, hard: 0 };
for (const q of existing) bands[bandOf(q.difficulty)]++;
const numerical = existing.filter((q) => q.type === "numerical").length;
const mix = `about 30% easy (difficulty 1-2), 45% medium (3), 25% hard (4-5); at least ${Math.ceil(count * 0.2)} numerical. Existing counts: easy ${bands.easy}, medium ${bands.medium}, hard ${bands.hard}, numerical ${numerical}; favour whatever is under-represented.`;

console.log(`${topic.id}: ${existing.length} existing (target ${topicTarget(unitIndex.get(topic.unitId)!)}); generating ${count} with ${model}`);
if (values["dry-run"]) {
  // ~2k in + ~6k out per question for generation, ~1.5k in + ~5k out for the independent solve.
  const usd = estimateUsd(model, count * 3500, count * 11000);
  console.log(`dry run: ~${Math.ceil(count / BATCH) + count} API calls (${Math.ceil(count / BATCH)} generation + ${count} solves), est. ${usd === null ? "unknown (add model to PRICE_PER_MTOK)" : `$${usd.toFixed(2)}`}. Nothing written.`);
  process.exit(0);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set.");
  process.exit(1);
}

const subject = topic.subjectId;
const misconceptions = readMisconceptions(subject).filter((m) => m.topicId === topic.id);
const exemplars = existing.slice(-5).map((q) => q.stem.slice(0, 300));
const out: QuestionInput[] = [];
let inTok = 0;
let outTok = 0;

for (let done = 0; done < count; done += BATCH) {
  const n = Math.min(BATCH, count - done);
  const gen = await generateQuestions({
    model,
    topic: { id: topic.id, name: topic.name, unitName: topic.unitName, subjectName: topic.subjectName },
    count: n,
    mix,
    misconceptions,
    exemplars: [...exemplars, ...out.map((q) => q.stem.slice(0, 300))],
  });
  inTok += gen.usage.input_tokens;
  outTok += gen.usage.output_tokens;

  // New misconceptions must belong to this topic and have sane ids.
  const newMis = gen.newMisconceptions
    .filter((m) => m.id.startsWith(`${topic.id}.`) && /^[a-z0-9.-]+$/.test(m.id))
    .map((m) => ({ id: m.id, topicId: topic.id, description: m.description, remediation: m.remediation }));
  appendMisconceptions(subject, newMis);
  misconceptions.push(...newMis);
  const knownMis = new Set(misconceptions.map((m) => m.id));

  for (const g of gen.questions) {
    const answer =
      g.type === "numerical"
        ? { kind: "numeric" as const, value: g.numericAnswer ?? NaN, tolerance: g.tolerance }
        : { kind: "choice" as const, keys: g.answerKey ? [g.answerKey] : [] };
    const draft: QuestionInput = {
      externalId: `gen:${topic.id}:${createHash("sha256").update(g.stem).digest("hex").slice(0, 10)}`,
      topicId: topic.id,
      type: g.type,
      stem: g.stem,
      options: g.options.map((o) => ({
        key: o.key,
        text: o.text,
        ...(o.misconceptionId && knownMis.has(o.misconceptionId) ? { misconceptionId: o.misconceptionId } : {}),
        ...(o.whyWrong ? { whyWrong: o.whyWrong } : {}),
      })),
      answer,
      solution: g.solution,
      hints: g.hints.slice(0, 3),
      difficulty: Math.min(5, Math.max(1, g.difficulty)),
      expectedTimeSec: Math.min(900, Math.max(20, g.expectedTimeSec)),
      skills: g.skills.map((s) => s.toLowerCase().replace(/[^a-z-]/g, "-")).slice(0, 6),
      source: "ai_generated",
      sourceRef: `${model} ${new Date().toISOString().slice(0, 10)}`,
      license: "proprietary",
      status: "draft",
    };

    const problems: string[] = [];
    const schema = QuestionSchema.safeParse(draft);
    if (!schema.success) problems.push(...schema.error.issues.map((i) => `schema: ${i.path.join(".")} ${i.message}`));
    for (const t of [draft.stem, draft.solution, ...(draft.options ?? []).map((o) => o.text)]) problems.push(...latexErrors(t).map((e) => `latex: ${e}`));

    if (!problems.length) {
      const solved = await solveIndependently(model, { type: draft.type, stem: draft.stem, options: draft.options ?? [] });
      inTok += solved.usage.input_tokens;
      outTok += solved.usage.output_tokens;
      if (!solveAgrees(schema.data!.answer, solved))
        problems.push(
          `independent solve disagreed: got ${solved.answerKey ?? solved.numericAnswer}${solved.ambiguous ? " (ambiguous)" : ""}${solved.outOfSyllabus ? " (out of syllabus)" : ""}${solved.needsFigure ? " (needs figure)" : ""} ${solved.issues}`.trim(),
        );
    }
    draft.status = problems.length ? "draft" : "auto_verified";
    if (problems.length) draft.reviewNotes = problems.join("; ").slice(0, 2000);
    out.push(draft);
    console.log(`  ${draft.status === "auto_verified" ? "✓" : "✗"} ${draft.externalId} d${draft.difficulty} ${draft.type}${problems.length ? `  ${problems[0].slice(0, 120)}` : ""}`);
  }
}

const added = appendQuestions(out);
const ok = out.filter((q) => q.status === "auto_verified").length;
const usd = estimateUsd(model, inTok, outTok);
console.log(`\nadded ${added}: ${ok} auto_verified, ${out.length - ok} draft. tokens in ${inTok} / out ${outTok}${usd !== null ? ` (~$${usd.toFixed(2)})` : ""}`);
console.log("Next: npm run content:validate, then review a sample (see /generate-questions).");
