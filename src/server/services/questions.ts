import "server-only";
import { and, eq, inArray, type SQL } from "drizzle-orm";
import { questions, type StoredOption } from "@/db/schema";
import { env } from "@/lib/env";
import { renderRich } from "@/lib/render/rich";

export type QuestionRow = typeof questions.$inferSelect;

/** What a student may see before answering. The ONLY serializer for unanswered questions. */
export interface PublicQuestion {
  id: string;
  topicId: string;
  type: QuestionRow["type"];
  stem: string;
  /** Pre-rendered safe HTML (renderRich) for web clients. */
  stemHtml: string;
  options: { key: StoredOption["key"]; text: string; html: string }[];
  difficulty: number;
  expectedTimeSec: number;
  hintsAvailable: number;
}

export function toPublicQuestion(q: QuestionRow): PublicQuestion {
  return {
    id: q.id,
    topicId: q.topicId,
    type: q.type,
    stem: q.stem,
    stemHtml: renderRich(q.stem),
    options: q.options.map((o) => ({ key: o.key, text: o.text, html: renderRich(o.text) })),
    difficulty: q.difficulty,
    expectedTimeSec: q.expectedTimeSec,
    hintsAvailable: q.hints.length,
  };
}

/** SQL filter for questions that may be served in practice. */
export function servableFilter(): SQL {
  const e = env();
  const statuses: QuestionRow["status"][] = e.PUBLISH_AUTO_VERIFIED ? ["published", "auto_verified"] : ["published"];
  const sources = e.ALLOW_SOURCES.filter((s): s is QuestionRow["source"] =>
    ["original", "ai_generated", "jeebench", "pw25", "nta"].includes(s),
  );
  return and(inArray(questions.status, statuses), inArray(questions.source, sources), eq(questions.mockReserve, false))!;
}

export function formatAnswer(q: Pick<QuestionRow, "answer">): string {
  return q.answer.kind === "choice" ? q.answer.keys.join(", ") : String(q.answer.value);
}
