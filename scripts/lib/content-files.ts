import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expectedFileFor } from "../../src/lib/content/load";
import type { Misconception, QuestionInput } from "../../src/lib/content/schema";

type QFile = { questions: QuestionInput[] };
type MFile = { misconceptions: Misconception[] };

function readJson<T>(file: string, empty: T): T {
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as T) : empty;
}
function writeJson(file: string, data: unknown) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

export function readTopicQuestions(topicId: string): QuestionInput[] {
  return readJson<QFile>(expectedFileFor(topicId), { questions: [] }).questions.filter((q) => q.topicId === topicId);
}

/** Appends questions to their unit file, skipping externalIds already present. Returns the number added. */
export function appendQuestions(qs: QuestionInput[]): number {
  let added = 0;
  const byFile = new Map<string, QuestionInput[]>();
  for (const q of qs) byFile.set(expectedFileFor(q.topicId), [...(byFile.get(expectedFileFor(q.topicId)) ?? []), q]);
  for (const [file, items] of byFile) {
    const data = readJson<QFile>(file, { questions: [] });
    const ids = new Set(data.questions.map((q) => q.externalId));
    for (const q of items) {
      if (ids.has(q.externalId)) continue;
      data.questions.push(q);
      added++;
    }
    writeJson(file, data);
  }
  return added;
}

export function readMisconceptions(subject: string): Misconception[] {
  return readJson<MFile>(path.join("content", "misconceptions", `${subject}.json`), { misconceptions: [] }).misconceptions;
}

export function appendMisconceptions(subject: string, ms: Misconception[]) {
  const file = path.join("content", "misconceptions", `${subject}.json`);
  const data = readJson<MFile>(file, { misconceptions: [] });
  const ids = new Set(data.misconceptions.map((m) => m.id));
  for (const m of ms) if (!ids.has(m.id)) data.misconceptions.push(m);
  writeJson(file, data);
}

export { readJson, writeJson };

/** Rough cost model for dry runs (USD per 1M tokens: input, output). Update when pricing changes. */
export const PRICE_PER_MTOK: Record<string, [number, number]> = {
  "claude-opus-5": [5, 25],
  "claude-sonnet-5": [2, 10],
  "claude-haiku-4-5": [1, 5],
};
export function estimateUsd(model: string, inputTok: number, outputTok: number): number | null {
  const p = PRICE_PER_MTOK[model];
  return p ? (inputTok * p[0] + outputTok * p[1]) / 1e6 : null;
}
