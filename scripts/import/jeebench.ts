/**
 * JEEBench (MIT): 515 JEE Advanced 2016-23 problems. https://github.com/dair-iitd/jeebench
 * Writes staging drafts to content/questions/_imports/jeebench.json. Then run `npm run content:enrich`.
 * Figure-dependent questions are skipped (no images in the dataset).
 */
import { ImportedQuestionSchema, type ImportedQuestion } from "../../src/lib/content/schema";
import { IMPORTS_DIR } from "../../src/lib/content/load";
import { writeJson } from "../lib/content-files";
import { fetchHfRows, normaliseLatex, splitLabelledOptions } from "./util";

const LICENSE = "MIT (JEEBench, dair-iitd); source papers: JEE Advanced, IIT JAB";
const SUBJECT = { phy: "phy", chem: "chem", math: "math" } as const;

type Row = { subject: string; description: string; gold: string; index: number; type: string; question: string };
const rows = await fetchHfRows<Row>("daman1209arora/jeebench", "default", "test");

const out: ImportedQuestion[] = [];
const skipped: Record<string, number> = {};
const skip = (why: string) => (skipped[why] = (skipped[why] ?? 0) + 1);

for (const r of rows) {
  const subject = SUBJECT[r.subject as keyof typeof SUBJECT];
  if (!subject) { skip("unknown subject"); continue; }
  if (/\b(figure|diagram|shown (below|above|in the))\b/i.test(r.question)) { skip("needs figure"); continue; }
  const base = {
    externalId: `jeebench:${r.description.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()}-q${r.index}`,
    subject,
    source: "jeebench" as const,
    sourceRef: `https://huggingface.co/datasets/daman1209arora/jeebench index=${r.index} (${r.description})`,
    license: LICENSE,
  };
  let item: unknown;
  if (r.type === "MCQ" || r.type === "MCQ(multiple)") {
    const split = splitLabelledOptions(r.question);
    if (!split) { skip("could not parse options"); continue; }
    const keys = r.gold.replace(/[^A-D]/g, "").split("") as ("A" | "B" | "C" | "D")[];
    item = { ...base, type: r.type === "MCQ" ? "single" : "multi", stem: normaliseLatex(split.stem), options: split.options.map((o) => ({ ...o, text: normaliseLatex(o.text) })), answer: { kind: "choice", keys } };
  } else if (r.type === "Integer" || r.type === "Numeric") {
    const value = Number(r.gold);
    if (!Number.isFinite(value)) { skip("non-numeric gold"); continue; }
    // JEE Advanced numeric answers are graded to 2 decimal places.
    item = { ...base, type: "numerical", stem: normaliseLatex(r.question), options: [], answer: { kind: "numeric", value, tolerance: r.type === "Integer" ? 0 : 0.01 } };
  } else { skip(`type ${r.type}`); continue; }

  const parsed = ImportedQuestionSchema.safeParse(item);
  if (parsed.success) out.push(parsed.data);
  else skip("schema");
}

writeJson(`${IMPORTS_DIR}/jeebench.json`, { questions: out });
console.log(`jeebench: ${rows.length} rows → ${out.length} staged. skipped: ${JSON.stringify(skipped)}`);
