import { describe, expect, it } from "vitest";
import { loadMisconceptions, loadRawQuestions } from "./load";
import { validateContent } from "./validate";

const mis = [{ id: "phy.kinematics.projectile.x", topicId: "phy.kinematics.projectile", description: "desc here", remediation: "fix it like this" }];
const good = {
  externalId: "orig:test-001",
  topicId: "phy.kinematics.projectile",
  type: "single",
  stem: "What is $1+1$?",
  options: [
    { key: "A", text: "1", whyWrong: "off by one" },
    { key: "B", text: "2" },
    { key: "C", text: "3", misconceptionId: "phy.kinematics.projectile.x" },
    { key: "D", text: "4", whyWrong: "doubled" },
  ],
  answer: { kind: "choice", keys: ["B"] },
  solution: "It is **2**.",
  difficulty: 1,
  expectedTimeSec: 30,
  source: "original",
  sourceRef: "test",
  license: "proprietary",
  status: "published",
};
const entry = (raw: unknown, file = "content/questions/phy/kinematics.json", index = 0) => ({ file, index, raw });

describe("validateContent", () => {
  it("accepts a well-formed question", () => {
    const r = validateContent([entry(good)], mis);
    expect(r.errors).toEqual([]);
    expect(r.valid).toHaveLength(1);
  });
  it("requires why-wrong info on distractors of original questions", () => {
    const bad = { ...good, options: good.options.map((o) => ({ key: o.key, text: o.text })) };
    expect(validateContent([entry(bad)], mis).errors.join()).toMatch(/needs misconceptionId or whyWrong/);
  });
  it("rejects unknown topics, wrong file placement and unknown misconceptions", () => {
    const errs = validateContent(
      [
        entry({ ...good, externalId: "orig:a", topicId: "phy.nope.nope" }),
        entry({ ...good, externalId: "orig:b" }, "content/questions/phy/optics.json"),
        entry({ ...good, externalId: "orig:c", options: [...good.options.slice(0, 2), { key: "C", text: "3", misconceptionId: "phy.kinematics.projectile.missing" }, good.options[3]] }),
      ],
      mis,
    ).errors.join("\n");
    expect(errs).toMatch(/unknown topicId/);
    expect(errs).toMatch(/belongs in content\/questions\/phy\/kinematics.json/);
    expect(errs).toMatch(/unknown misconception/);
  });
  it("rejects duplicates and broken LaTeX", () => {
    const errs = validateContent([entry(good), entry({ ...good, externalId: "orig:dup" }, undefined, 1), entry({ ...good, externalId: "orig:tex", stem: "Bad $\\frac{1}{$ here" })], mis).errors.join("\n");
    expect(errs).toMatch(/identical content/);
    expect(errs).toMatch(/LaTeX/);
  });
  it("enforces single-correct and numeric shapes", () => {
    const errs = validateContent(
      [
        entry({ ...good, externalId: "orig:two", answer: { kind: "choice", keys: ["A", "B"] } }),
        entry({ ...good, externalId: "orig:num", type: "numerical", answer: { kind: "numeric", value: 2 } }),
      ],
      mis,
    ).errors.join("\n");
    expect(errs).toMatch(/exactly one key/);
    expect(errs).toMatch(/must not have options/);
  });
  it("the committed content is valid", () => {
    const r = validateContent(loadRawQuestions(), loadMisconceptions());
    expect(r.errors).toEqual([]);
    expect(r.valid.length).toBeGreaterThan(0);
  });
});
