/**
 * Upserts syllabus, misconceptions and curated questions into Postgres. Idempotent.
 * Questions are matched on externalId. A changed contentHash bumps `version`.
 */
import { sql } from "drizzle-orm";
import { loadMisconceptions, loadRawQuestions } from "../src/lib/content/load";
import { validateContent } from "../src/lib/content/validate";
import { syllabus } from "../src/lib/syllabus";
import { misconceptions, questions, topics, units } from "../src/db/schema";
import { db, sqlClient } from "./db";

const { valid, errors } = validateContent(loadRawQuestions(), loadMisconceptions());
if (errors.length) {
  console.error(`Refusing to import: ${errors.length} validation error(s). Run npm run content:validate.`);
  process.exit(1);
}

await db.transaction(async (tx) => {
  let pos = 0;
  for (const s of syllabus.subjects) {
    for (const u of s.units) {
      await tx
        .insert(units)
        .values({ id: u.id, subject: s.id, name: u.name, classLevel: u.class, weight: u.weight, position: pos++ })
        .onConflictDoUpdate({ target: units.id, set: { name: u.name, classLevel: u.class, weight: u.weight, position: sql`excluded.position` } });
      let tpos = 0;
      for (const t of u.topics)
        await tx
          .insert(topics)
          .values({ id: t.id, unitId: u.id, subject: s.id, name: t.name, position: tpos++ })
          .onConflictDoUpdate({ target: topics.id, set: { name: t.name, unitId: u.id, position: sql`excluded.position` } });
    }
  }

  for (const m of loadMisconceptions())
    await tx
      .insert(misconceptions)
      .values({ id: m.id, topicId: m.topicId, description: m.description, remediation: m.remediation })
      .onConflictDoUpdate({ target: misconceptions.id, set: { description: m.description, remediation: m.remediation, topicId: m.topicId } });

  for (const q of valid) {
    const row = {
      externalId: q.externalId,
      topicId: q.topicId,
      secondaryTopicIds: q.secondaryTopicIds,
      subject: q.topicId.split(".")[0] as "phy" | "chem" | "math",
      type: q.type,
      stem: q.stem,
      options: q.options,
      answer: q.answer,
      solution: q.solution,
      hints: q.hints,
      difficulty: q.difficulty,
      expectedTimeSec: q.expectedTimeSec,
      skills: q.skills,
      source: q.source,
      sourceRef: q.sourceRef,
      license: q.license,
      status: q.status,
      mockReserve: q.mockReserve,
      contentHash: q.hash,
      reviewNotes: q.reviewNotes ?? null,
    };
    await tx
      .insert(questions)
      .values(row)
      .onConflictDoUpdate({
        target: questions.externalId,
        set: {
          ...row,
          version: sql`CASE WHEN ${questions.contentHash} <> excluded.content_hash THEN ${questions.version} + 1 ELSE ${questions.version} END`,
          updatedAt: sql`now()`,
        },
      });
  }
});

console.log(`imported ${syllabus.subjects.reduce((a, s) => a + s.units.length, 0)} units, ${valid.length} questions`);
await sqlClient.end();
