import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { questions } from "@/db/schema";
import { requireRole } from "@/lib/auth/session";
import { handler, json } from "@/lib/http";
import { syllabus } from "@/lib/syllabus";
import { topicTarget } from "@/lib/syllabus/targets";

export const GET = handler(async () => {
  await requireRole("reviewer");
  const rows = await db
    .select({
      topicId: questions.topicId,
      status: questions.status,
      easy: sql<number>`count(*) filter (where ${questions.difficulty} <= 2)::int`,
      medium: sql<number>`count(*) filter (where ${questions.difficulty} = 3)::int`,
      hard: sql<number>`count(*) filter (where ${questions.difficulty} >= 4)::int`,
      numerical: sql<number>`count(*) filter (where ${questions.type} = 'numerical')::int`,
      total: sql<number>`count(*)::int`,
    })
    .from(questions)
    .where(and(eq(questions.mockReserve, false)))
    .groupBy(questions.topicId, questions.status);
  const topics = syllabus.subjects.flatMap((s) =>
    s.units.flatMap((u) =>
      u.topics.map((t) => ({ topicId: t.id, target: topicTarget(u), byStatus: rows.filter((r) => r.topicId === t.id) })),
    ),
  );
  return json({ topics });
});
