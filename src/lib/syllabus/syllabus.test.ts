import { describe, expect, it } from "vitest";
import { syllabus, topicIndex } from "./index";
import { topicTarget, unitTarget } from "./targets";

describe("syllabus", () => {
  it("has the official NTA unit counts (20 / 20 / 14)", () => {
    expect(syllabus.subjects.map((s) => [s.id, s.units.length])).toEqual([["phy", 20], ["chem", 20], ["math", 14]]);
  });
  it("has unique, well-formed topic ids nested under their unit", () => {
    const ids = syllabus.subjects.flatMap((s) => s.units.flatMap((u) => u.topics.map((t) => [u.id, t.id])));
    expect(new Set(ids.map(([, t]) => t)).size).toBe(ids.length);
    for (const [u, t] of ids) expect(t.startsWith(`${u}.`)).toBe(true);
    expect(topicIndex.size).toBe(ids.length);
  });
  it("computes launch targets per DATA_STRATEGY §5", () => {
    expect(unitTarget({ weight: 3.5, topics: Array(5).fill({}) })).toBe(280);
    expect(topicTarget({ weight: 3.5, topics: Array(5).fill({}) })).toBe(56);
    expect(topicTarget({ weight: 0.5, topics: Array(2).fill({}) })).toBe(30);
  });
});
