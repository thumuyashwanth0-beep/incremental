/**
 * Enrich staged imports (content/questions/_imports/<source>.json) with Claude:
 * topic classification, worked solution, hints, why-wrong notes, then an INDEPENDENT solve
 * that must agree with the official key. Results are appended to the curated unit files.
 *   npm run content:enrich -- --file content/questions/_imports/pw25.json --limit 20 [--dry-run]
 * Re-runs resume: items already curated (same externalId) are skipped.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { enrichImported, solveAgrees, solveIndependently } from "../src/lib/ai/content-pipeline";
import { loadRawQuestions } from "../src/lib/content/load";
import { ImportedQuestionSchema, QuestionSchema, type QuestionInput } from "../src/lib/content/schema";
import { latexErrors } from "../src/lib/content/validate";
import { syllabus, topicIndex } from "../src/lib/syllabus";
import { appendQuestions, estimateUsd } from "./lib/content-files";

const { values } = parseArgs({
  options: { file: { type: "string" }, limit: { type: "string", default: "20" }, "dry-run": { type: "boolean", default: false } },
});
if (!values.file) {
  console.error("usage: --file content/questions/_imports/<source>.json [--limit N] [--dry-run]");
  process.exit(1);
}
const model = process.env.AI_MODEL || "claude-opus-5";
const staged = (JSON.parse(readFileSync(values.file, "utf8")).questions as unknown[]).map((q) => ImportedQuestionSchema.parse(q));
const curated = new Set(loadRawQuestions().map((e) => (e.raw as { externalId?: string }).externalId));
const todo = staged.filter((q) => !curated.has(q.externalId)).slice(0, Number(values.limit));

console.log(`${values.file}: ${staged.length} staged, ${staged.length - staged.filter((q) => !curated.has(q.externalId)).length} already curated, processing ${todo.length}`);
if (values["dry-run"]) {
  const usd = estimateUsd(model, todo.length * 5000, todo.length * 12000);
  console.log(`dry run: ${todo.length * 2} API calls, est. ${usd === null ? "unknown" : `$${usd.toFixed(2)}`}. Nothing written.`);
  process.exit(0);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set.");
  process.exit(1);
}

let inTok = 0;
let outTok = 0;
const results: QuestionInput[] = [];
for (const q of todo) {
  const subject = syllabus.subjects.find((s) => s.id === q.subject)!;
  const topics = subject.units.flatMap((u) => u.topics.map((t) => ({ id: t.id, name: `${u.name}: ${t.name}` })));
  const official = q.answer.kind === "choice" ? q.answer.keys.join(", ") : String(q.answer.value);
  try {
    const e = await enrichImported(model, { stem: q.stem, options: q.options, officialAnswer: official, type: q.type }, topics);
    const s = await solveIndependently(model, { type: q.type, stem: q.stem, options: q.options });
    inTok += e.usage.input_tokens + s.usage.input_tokens;
    outTok += e.usage.output_tokens + s.usage.output_tokens;

    const problems: string[] = [];
    const topicId = topicIndex.get(e.topicId)?.subjectId === q.subject ? e.topicId : null;
    if (!topicId) problems.push(`classifier returned unknown topic ${e.topicId}`);
    if (e.solution.startsWith("KEY-MISMATCH")) problems.push("solution writer could not reach the official key");
    if (!solveAgrees(q.answer, s)) problems.push(`independent solve got ${s.answerKey ?? s.numericAnswer}; ${s.issues}`.trim());

    const notes = new Map(e.optionNotes.map((n) => [n.key, n.whyWrong]));
    const correct = q.answer.kind === "choice" ? q.answer.keys : [];
    const item: QuestionInput = {
      externalId: q.externalId,
      topicId: topicId ?? topics[0].id,
      type: q.type,
      stem: q.stem,
      options: q.options.map((o) => ({ ...o, ...(!correct.includes(o.key) && notes.get(o.key) ? { whyWrong: notes.get(o.key) } : {}) })),
      answer: q.answer,
      solution: e.solution,
      hints: e.hints.slice(0, 3),
      difficulty: Math.min(5, Math.max(1, e.difficulty)),
      expectedTimeSec: Math.min(900, Math.max(20, e.expectedTimeSec)),
      skills: e.skills.map((x) => x.toLowerCase().replace(/[^a-z-]/g, "-")).slice(0, 6),
      source: q.source,
      sourceRef: q.sourceRef,
      license: q.license,
      status: "draft",
    };
    for (const t of [item.stem, item.solution]) problems.push(...latexErrors(t).map((x) => `latex: ${x}`));
    if (!QuestionSchema.safeParse(item).success) problems.push("schema validation failed");
    item.status = problems.length ? "draft" : "auto_verified";
    if (problems.length) item.reviewNotes = problems.join("; ").slice(0, 2000);
    // Unclassifiable items stay in staging; everything else goes to its unit file.
    if (topicId) results.push(item);
    console.log(`  ${item.status === "auto_verified" ? "✓" : "✗"} ${q.externalId} → ${topicId ?? "?"}${problems.length ? `  ${problems[0].slice(0, 100)}` : ""}`);
  } catch (err) {
    console.error(`  ! ${q.externalId}: ${(err as Error).message}`);
  }
}
const added = appendQuestions(results);
const usd = estimateUsd(model, inTok, outTok);
console.log(`\nadded ${added} (${results.filter((r) => r.status === "auto_verified").length} auto_verified). tokens in ${inTok} / out ${outTok}${usd !== null ? ` (~$${usd.toFixed(2)})` : ""}`);
