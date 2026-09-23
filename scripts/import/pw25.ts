/**
 * PhysicsWallahAI/JEE-Main-2025-Math (Apache-2.0): 475 maths questions from the Jan + Apr 2025 papers.
 * https://huggingface.co/datasets/PhysicsWallahAI/JEE-Main-2025-Math
 * Writes staging drafts to content/questions/_imports/pw25.json. Then run `npm run content:enrich`.
 */
import { createHash } from "node:crypto";
import { ImportedQuestionSchema, type ImportedQuestion } from "../../src/lib/content/schema";
import { IMPORTS_DIR } from "../../src/lib/content/load";
import { writeJson } from "../lib/content-files";
import { normaliseLatex } from "./util";

const LICENSE = "Apache-2.0 (PhysicsWallahAI/JEE-Main-2025-Math); source papers: NTA JEE Main 2025";
const FILES = { jan: "main2025-jan.jsonl", apr: "main2025-apr.jsonl" };
const KEYS = ["A", "B", "C", "D"] as const;

type Row = { question: string; answer: string; options: string[] | null; correct_options: number[] | null; question_type: number };

const out: ImportedQuestion[] = [];
let skipped = 0;
for (const [session, file] of Object.entries(FILES)) {
  const url = `https://huggingface.co/datasets/PhysicsWallahAI/JEE-Main-2025-Math/resolve/main/${file}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const lines = (await res.text()).split("\n").filter(Boolean);
  lines.forEach((line, i) => {
    const r = JSON.parse(line) as Row;
    const hash = createHash("sha256").update(r.question).digest("hex").slice(0, 8);
    const base = {
      externalId: `pw25:${session}-${i}-${hash}`,
      subject: "math" as const,
      stem: normaliseLatex(r.question),
      source: "pw25" as const,
      sourceRef: `${url} line=${i}`,
      license: LICENSE,
    };
    const item =
      r.question_type === 1 && r.options?.length === 4 && r.correct_options?.length
        ? { ...base, type: r.correct_options.length > 1 ? "multi" : "single", options: r.options.map((t, k) => ({ key: KEYS[k], text: normaliseLatex(t) })), answer: { kind: "choice", keys: r.correct_options.map((k) => KEYS[k]) } }
        : { ...base, type: "numerical", options: [], answer: { kind: "numeric", value: Number(r.answer), tolerance: 0 } };
    const parsed = ImportedQuestionSchema.safeParse(item);
    if (parsed.success && (parsed.data.answer.kind !== "numeric" || Number.isFinite(parsed.data.answer.value))) out.push(parsed.data);
    else skipped++;
  });
}
writeJson(`${IMPORTS_DIR}/pw25.json`, { questions: out });
console.log(`pw25: staged ${out.length}, skipped ${skipped}`);
