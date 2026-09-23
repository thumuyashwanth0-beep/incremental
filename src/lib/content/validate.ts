import katex from "katex";
import { topicIndex } from "@/lib/syllabus";
import { contentHash, stemFingerprint } from "./hash";
import { expectedFileFor, type RawQuestionEntry } from "./load";
import { QuestionSchema, type Misconception, type Question } from "./schema";

export interface ValidationResult {
  valid: (Question & { file: string; hash: string })[];
  errors: string[];
  warnings: string[];
}

const MATH_RE = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$((?:\\\$|[^$\n])+?)\$/g;

export function latexErrors(text: string): string[] {
  const errs: string[] = [];
  for (const m of text.matchAll(MATH_RE)) {
    const tex = m[1] ?? m[2] ?? m[3] ?? m[4];
    try {
      katex.renderToString(tex, { throwOnError: true, strict: "ignore", trust: false });
    } catch (e) {
      errs.push(`${(e as Error).message.split("\n")[0]} in "${tex.slice(0, 60)}"`);
    }
  }
  return errs;
}

export function validateContent(entries: RawQuestionEntry[], misconceptions: Misconception[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const valid: ValidationResult["valid"] = [];
  const misIds = new Set<string>();

  for (const m of misconceptions) {
    if (misIds.has(m.id)) errors.push(`misconception ${m.id}: duplicate id`);
    misIds.add(m.id);
    if (!topicIndex.has(m.topicId)) errors.push(`misconception ${m.id}: unknown topicId ${m.topicId}`);
  }

  const byExternal = new Map<string, string>();
  const byHash = new Map<string, string>();
  const byFingerprint = new Map<string, string>();

  for (const { file, index, raw } of entries) {
    const where = `${file}#${index}${raw && typeof raw === "object" && "externalId" in raw ? ` (${String(raw.externalId)})` : ""}`;
    const parsed = QuestionSchema.safeParse(raw);
    if (!parsed.success) {
      for (const i of parsed.error.issues) errors.push(`${where}: ${i.path.join(".") || "(root)"}: ${i.message}`);
      continue;
    }
    const q = parsed.data;
    const before = errors.length;

    if (!topicIndex.has(q.topicId)) errors.push(`${where}: unknown topicId ${q.topicId}`);
    else if (expectedFileFor(q.topicId) !== file) errors.push(`${where}: belongs in ${expectedFileFor(q.topicId)}`);
    for (const t of q.secondaryTopicIds) if (!topicIndex.has(t)) errors.push(`${where}: unknown secondary topic ${t}`);
    for (const o of q.options)
      if (o.misconceptionId && !misIds.has(o.misconceptionId))
        errors.push(`${where}: option ${o.key} references unknown misconception ${o.misconceptionId}`);

    const texts = [q.stem, q.solution, ...q.hints, ...q.options.map((o) => o.text)];
    for (const t of texts) for (const e of latexErrors(t)) errors.push(`${where}: LaTeX: ${e}`);

    const prev = byExternal.get(q.externalId);
    if (prev) errors.push(`${where}: duplicate externalId (also ${prev})`);
    byExternal.set(q.externalId, where);

    const hash = contentHash(q);
    const dup = byHash.get(hash);
    if (dup) errors.push(`${where}: identical content to ${dup}`);
    byHash.set(hash, where);

    const fp = stemFingerprint(q.stem);
    const near = byFingerprint.get(fp);
    if (near) warnings.push(`${where}: same stem template as ${near} (fine if it's an intended sibling)`);
    byFingerprint.set(fp, where);

    if (q.answer.kind === "numeric" && q.answer.value !== 0 && q.answer.tolerance > Math.abs(q.answer.value) * 0.05)
      warnings.push(`${where}: numeric tolerance > 5% of the answer`);
    if (q.status === "published" && q.source === "nta" && !/nta/i.test(q.license))
      errors.push(`${where}: NTA questions must carry an NTA license string`);

    if (errors.length === before) valid.push({ ...q, file, hash });
  }
  return { valid, errors, warnings };
}
