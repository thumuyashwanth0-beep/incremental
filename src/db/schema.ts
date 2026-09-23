import {
  boolean,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  date,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { Answer } from "@/lib/content/schema";
import type { Diagnosis } from "@/lib/engine/diagnosis";
import type { AttemptResponse } from "@/lib/engine/grade";
import type { WorkingAnalysis } from "@/lib/ai/schemas";

// citext keeps email uniqueness case-insensitive.
const citext = customType<{ data: string }>({ dataType: () => "citext" });
const ts = (name: string) => timestamp(name, { withTimezone: true });

export const roleEnum = pgEnum("role", ["student", "reviewer", "admin"]);
export const questionTypeEnum = pgEnum("question_type", ["single", "multi", "numerical"]);
export const questionStatusEnum = pgEnum("question_status", ["draft", "auto_verified", "in_review", "published", "retired"]);
export const questionSourceEnum = pgEnum("question_source", ["original", "ai_generated", "jeebench", "pw25", "nta"]);
export const subjectEnum = pgEnum("subject", ["phy", "chem", "math"]);
export const sessionModeEnum = pgEnum("practice_mode", ["topic", "adaptive", "review"]);
export const confidenceEnum = pgEnum("confidence", ["sure", "unsure", "guess"]);
export const reportReasonEnum = pgEnum("report_reason", ["wrong_key", "typo", "unclear", "out_of_syllabus", "other"]);

// ---------- identity ----------

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: citext("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: roleEnum("role").notNull().default("student"),
  examDate: date("exam_date"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    /** sha256(token) hex. The raw token only exists in the user's cookie. */
    id: text("id").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

// ---------- syllabus (seeded from content/syllabus) ----------

export const units = pgTable("units", {
  id: text("id").primaryKey(),
  subject: subjectEnum("subject").notNull(),
  name: text("name").notNull(),
  classLevel: smallint("class_level").notNull(),
  weight: real("weight").notNull(),
  position: integer("position").notNull(),
});

export const topics = pgTable(
  "topics",
  {
    id: text("id").primaryKey(),
    unitId: text("unit_id").notNull().references(() => units.id),
    subject: subjectEnum("subject").notNull(),
    name: text("name").notNull(),
    position: integer("position").notNull(),
  },
  (t) => [index("topics_unit_idx").on(t.unitId)],
);

export const misconceptions = pgTable("misconceptions", {
  id: text("id").primaryKey(),
  topicId: text("topic_id").notNull().references(() => topics.id),
  description: text("description").notNull(),
  remediation: text("remediation").notNull(),
});

// ---------- questions ----------

export interface StoredOption {
  key: "A" | "B" | "C" | "D";
  text: string;
  misconceptionId?: string;
  whyWrong?: string;
}

export const questions = pgTable(
  "questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    externalId: text("external_id").notNull().unique(),
    version: integer("version").notNull().default(1),
    topicId: text("topic_id").notNull().references(() => topics.id),
    secondaryTopicIds: text("secondary_topic_ids").array().notNull().default(sql`'{}'::text[]`),
    subject: subjectEnum("subject").notNull(),
    type: questionTypeEnum("type").notNull(),
    stem: text("stem").notNull(),
    options: jsonb("options").$type<StoredOption[]>().notNull(),
    answer: jsonb("answer").$type<Answer>().notNull(),
    solution: text("solution").notNull(),
    hints: jsonb("hints").$type<string[]>().notNull().default([]),
    difficulty: smallint("difficulty").notNull(),
    expectedTimeSec: integer("expected_time_sec").notNull(),
    skills: text("skills").array().notNull().default(sql`'{}'::text[]`),
    source: questionSourceEnum("source").notNull(),
    sourceRef: text("source_ref").notNull(),
    license: text("license").notNull(),
    status: questionStatusEnum("status").notNull(),
    mockReserve: boolean("mock_reserve").notNull().default(false),
    contentHash: text("content_hash").notNull(),
    reviewNotes: text("review_notes"),
    /** Calibrated from attempt data (item-health job). Null until enough attempts. */
    calibratedB: doublePrecision("calibrated_b"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("questions_serve_idx").on(t.topicId, t.status, t.difficulty),
    index("questions_hash_idx").on(t.contentHash),
  ],
);

// ---------- practice ----------

export const practiceSessions = pgTable(
  "practice_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    mode: sessionModeEnum("mode").notNull(),
    topicId: text("topic_id").references(() => topics.id),
    subject: subjectEnum("subject"),
    targetCount: smallint("target_count").notNull().default(10),
    servedCount: smallint("served_count").notNull().default(0),
    /** Question currently served and not yet answered (guards against answering arbitrary IDs). */
    currentQuestionId: uuid("current_question_id").references(() => questions.id),
    currentServedAt: ts("current_served_at"),
    /** Set when the current question is a spaced-review re-test. */
    currentReviewItemId: uuid("current_review_item_id"),
    /** Hints revealed for the current question (server-tracked so mastery credit can't be gamed). */
    currentHintsUsed: smallint("current_hints_used").notNull().default(0),
    startedAt: ts("started_at").notNull().defaultNow(),
    endedAt: ts("ended_at"),
  },
  (t) => [index("practice_sessions_user_idx").on(t.userId, t.startedAt)],
);

export const attempts = pgTable(
  "attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").references(() => practiceSessions.id, { onDelete: "set null" }),
    questionId: uuid("question_id").notNull().references(() => questions.id),
    questionVersion: integer("question_version").notNull(),
    topicId: text("topic_id").notNull().references(() => topics.id),
    response: jsonb("response").$type<AttemptResponse>().notNull(),
    isCorrect: boolean("is_correct").notNull(),
    timeTakenMs: integer("time_taken_ms").notNull(),
    confidence: confidenceEnum("confidence"),
    hintsUsed: smallint("hints_used").notNull().default(0),
    working: text("working"),
    diagnosis: jsonb("diagnosis").$type<Diagnosis>().notNull(),
    aiAnalysis: jsonb("ai_analysis").$type<WorkingAnalysis>(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("attempts_user_time_idx").on(t.userId, t.createdAt),
    index("attempts_user_topic_idx").on(t.userId, t.topicId),
    index("attempts_question_idx").on(t.questionId),
  ],
);

export const topicMastery = pgTable(
  "topic_mastery",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    topicId: text("topic_id").notNull().references(() => topics.id),
    theta: doublePrecision("theta").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    correct: integer("correct").notNull().default(0),
    /** Running mean of timeTaken / expectedTime. */
    avgTimeRatio: doublePrecision("avg_time_ratio").notNull().default(1),
    lastPracticedAt: ts("last_practiced_at"),
  },
  (t) => [primaryKey({ columns: [t.userId, t.topicId] })],
);

export const reviewItems = pgTable(
  "review_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    /** The question originally missed. The re-test serves a sibling where possible. */
    questionId: uuid("question_id").notNull().references(() => questions.id),
    topicId: text("topic_id").notNull().references(() => topics.id),
    misconceptionId: text("misconception_id"),
    dueAt: ts("due_at").notNull(),
    intervalDays: real("interval_days").notNull(),
    successes: smallint("successes").notNull().default(0),
    lapses: smallint("lapses").notNull().default(0),
    retiredAt: ts("retired_at"),
  },
  (t) => [
    index("review_due_idx").on(t.userId, t.dueAt),
    uniqueIndex("review_user_question_uq").on(t.userId, t.questionId),
  ],
);

// ---------- ops ----------

export const questionReports = pgTable(
  "question_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    questionId: uuid("question_id").notNull().references(() => questions.id),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    reason: reportReasonEnum("reason").notNull(),
    note: text("note"),
    resolvedAt: ts("resolved_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("reports_user_question_uq").on(t.userId, t.questionId)],
);

export const aiUsage = pgTable(
  "ai_usage",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
);
