import { z } from "zod";
import syllabusJson from "../../../content/syllabus/jee-main.json";

const TopicSchema = z.object({ id: z.string(), name: z.string() }).strict();
const UnitSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    class: z.union([z.literal(11), z.literal(12)]),
    weight: z.number().positive(),
    topics: z.array(TopicSchema).min(1),
  })
  .strict();
const SubjectSchema = z.object({ id: z.enum(["phy", "chem", "math"]), name: z.string(), units: z.array(UnitSchema) }).strict();
const SyllabusSchema = z
  .object({
    exam: z.string(),
    syllabusVersion: z.string(),
    source: z.string(),
    weightNote: z.string(),
    subjects: z.array(SubjectSchema),
  })
  .strict();

export type Syllabus = z.infer<typeof SyllabusSchema>;
export type SubjectId = z.infer<typeof SubjectSchema>["id"];
export type Unit = z.infer<typeof UnitSchema>;

export interface TopicInfo {
  id: string;
  name: string;
  unitId: string;
  unitName: string;
  unitWeight: number;
  subjectId: SubjectId;
  subjectName: string;
  /** Number of topics in the unit (used to split unit weight). */
  unitTopicCount: number;
}

export const syllabus: Syllabus = SyllabusSchema.parse(syllabusJson);

export const topicIndex: ReadonlyMap<string, TopicInfo> = new Map(
  syllabus.subjects.flatMap((s) =>
    s.units.flatMap((u) =>
      u.topics.map((t) => [
        t.id,
        {
          id: t.id,
          name: t.name,
          unitId: u.id,
          unitName: u.name,
          unitWeight: u.weight,
          subjectId: s.id,
          subjectName: s.name,
          unitTopicCount: u.topics.length,
        },
      ]),
    ),
  ),
);

export const unitIndex: ReadonlyMap<string, Unit & { subjectId: SubjectId }> = new Map(
  syllabus.subjects.flatMap((s) => s.units.map((u) => [u.id, { ...u, subjectId: s.id }])),
);

export function getTopic(id: string): TopicInfo | undefined {
  return topicIndex.get(id);
}

/** "phy.kinematics" → "kinematics" (file name under content/questions/<subject>/). */
export function unitSlug(unitId: string): string {
  return unitId.split(".")[1];
}
