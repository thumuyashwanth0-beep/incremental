import { createHash } from "node:crypto";
import type { Question } from "./schema";

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").replace(/[^\p{L}\p{N}$\\^_{}.+\-*/=() ]/gu, "").trim();

/** Hash of what a student sees and is graded on. Used for dedupe and change detection. */
export function contentHash(q: Pick<Question, "stem" | "options" | "answer">): string {
  const payload = JSON.stringify([norm(q.stem), q.options.map((o) => norm(o.text)), q.answer]);
  return createHash("sha256").update(payload).digest("hex");
}

/** Stem-only fingerprint for near-duplicate detection across sources. */
export function stemFingerprint(stem: string): string {
  return createHash("sha256").update(norm(stem).replace(/\d+(\.\d+)?/g, "#")).digest("hex").slice(0, 16);
}
