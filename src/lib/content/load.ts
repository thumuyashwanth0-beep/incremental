/** Filesystem loader for content/ (used by CLI scripts and tests, not by the web app). */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { MisconceptionFileSchema, QuestionFileSchema, type Misconception } from "./schema";

export const CONTENT_DIR = path.resolve(process.cwd(), "content");
export const QUESTIONS_DIR = path.join(CONTENT_DIR, "questions");
export const IMPORTS_DIR = path.join(QUESTIONS_DIR, "_imports");

export interface RawQuestionEntry {
  file: string; // relative to repo root
  index: number;
  raw: unknown;
}

function walkJson(dir: string, skip: (p: string) => boolean): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (skip(p)) return [];
    if (e.isDirectory()) return walkJson(p, skip);
    return e.name.endsWith(".json") ? [p] : [];
  });
}

const rel = (p: string) => path.relative(process.cwd(), p);

/** All curated question entries (excludes content/questions/_imports). */
export function loadRawQuestions(): RawQuestionEntry[] {
  return walkJson(QUESTIONS_DIR, (p) => p.startsWith(IMPORTS_DIR)).flatMap((file) => {
    const parsed = QuestionFileSchema.parse(JSON.parse(readFileSync(file, "utf8")));
    return parsed.questions.map((raw, index) => ({ file: rel(file), index, raw }));
  });
}

export function loadMisconceptions(): (Misconception & { file: string })[] {
  return walkJson(path.join(CONTENT_DIR, "misconceptions"), () => false).flatMap((file) =>
    MisconceptionFileSchema.parse(JSON.parse(readFileSync(file, "utf8"))).misconceptions.map((m) => ({ ...m, file: rel(file) })),
  );
}

/** Where a question for this topic must live. */
export function expectedFileFor(topicId: string): string {
  const [subject, unit] = topicId.split(".");
  return path.join("content", "questions", subject, `${unit}.json`);
}
