import { describe, expect, it } from "vitest";
import type { Answer } from "@/lib/content/schema";
import { grade } from "./grade";
import { diagnose, type DiagnosisInput } from "./diagnosis";
import { INITIAL_MASTERY, masteryScore, updateMastery, type MasteryState } from "./mastery";
import { pickQuestion, pickTopic, seededRng, targetDifficulty } from "./selection";
import { applyReviewResult, isStuck, newReview } from "./review";
import { recurringMisconceptions, signalBreakdown, weakTopics } from "./recommendations";

describe("grade", () => {
  it("grades single choice", () => {
    expect(grade({ kind: "choice", keys: ["B"] }, { kind: "choice", keys: ["B"] })).toBe(true);
    expect(grade({ kind: "choice", keys: ["B"] }, { kind: "choice", keys: ["A"] })).toBe(false);
  });
  it("requires the exact set for multi-correct", () => {
    const key: Answer = { kind: "choice", keys: ["A", "C"] };
    expect(grade(key, { kind: "choice", keys: ["C", "A"] })).toBe(true);
    expect(grade(key, { kind: "choice", keys: ["A"] })).toBe(false);
  });
  it("applies numeric tolerance", () => {
    const key = { kind: "numeric", value: 12.5, tolerance: 0.1 } as const;
    expect(grade(key, { kind: "numeric", value: 12.58 })).toBe(true);
    expect(grade(key, { kind: "numeric", value: 12.7 })).toBe(false);
    expect(grade({ kind: "numeric", value: 3, tolerance: 0 }, { kind: "numeric", value: 3 })).toBe(true);
    expect(grade(key, { kind: "numeric", value: Number.NaN })).toBe(false);
  });
  it("treats skip and mismatched kinds as wrong", () => {
    expect(grade({ kind: "choice", keys: ["A"] }, { kind: "skip" })).toBe(false);
    expect(grade({ kind: "choice", keys: ["A"] }, { kind: "numeric", value: 1 })).toBe(false);
  });
});

describe("diagnose", () => {
  const base: DiagnosisInput = {
    correct: false,
    response: { kind: "choice", keys: ["C"] },
    options: [{ key: "A" }, { key: "B" }, { key: "C", misconceptionId: "phy.x.sign", whyWrong: "sign error" }, { key: "D" }],
    expectedTimeSec: 120,
    timeTakenMs: 100_000,
    confidence: "unsure",
    hintsUsed: 0,
    remediations: { "phy.x.sign": "Fix a positive direction first." },
  };

  it("sure + wrong → misconception, with remediation tip", () => {
    const d = diagnose({ ...base, confidence: "sure" });
    expect(d.signal).toBe("misconception");
    expect(d.misconceptionId).toBe("phy.x.sign");
    expect(d.tips).toContain("Fix a positive direction first.");
    expect(d.scheduleReview).toBe(true);
  });
  it("very fast + wrong → careless", () => {
    expect(diagnose({ ...base, timeTakenMs: 20_000 }).signal).toBe("careless");
  });
  it("guess + wrong → knowledge gap", () => {
    expect(diagnose({ ...base, confidence: "guess" }).signal).toBe("knowledge_gap");
  });
  it("correct but guessed → fragile, reviewed", () => {
    const d = diagnose({ ...base, correct: true, confidence: "guess" });
    expect(d.signal).toBe("fragile");
    expect(d.scheduleReview).toBe(true);
    expect(d.misconceptionId).toBeUndefined();
  });
  it("correct + sure + slow → inefficient, not reviewed", () => {
    const d = diagnose({ ...base, correct: true, confidence: "sure", timeTakenMs: 300_000 });
    expect(d.signal).toBe("inefficient");
    expect(d.timeFlag).toBe("slow");
    expect(d.scheduleReview).toBe(false);
  });
  it("correct + sure + normal → solid", () => {
    expect(diagnose({ ...base, correct: true, confidence: "sure" }).signal).toBe("solid");
  });
  it("skip → skipped", () => {
    expect(diagnose({ ...base, response: { kind: "skip" } }).outcome).toBe("skipped");
  });
});

describe("mastery", () => {
  const run = (results: boolean[], difficulty: number) =>
    results.reduce<MasteryState>(
      (s, correct) => updateMastery(s, { correct, difficulty, hintsUsed: 0, timeRatio: 1 }),
      INITIAL_MASTERY,
    );

  it("rises with correct answers and falls with wrong ones", () => {
    expect(run([true], 3).theta).toBeGreaterThan(0);
    expect(run([false], 3).theta).toBeLessThan(0);
  });
  it("a student acing hard questions converges above 0.8 within 15 attempts", () => {
    expect(masteryScore(run(Array(15).fill(true), 5).theta)).toBeGreaterThan(0.8);
  });
  it("a student failing easy questions ends well below 0.3", () => {
    expect(masteryScore(run(Array(15).fill(false), 1).theta)).toBeLessThan(0.3);
  });
  it("gives less credit when hints were used", () => {
    const noHint = updateMastery(INITIAL_MASTERY, { correct: true, difficulty: 3, hintsUsed: 0, timeRatio: 1 });
    const hint = updateMastery(INITIAL_MASTERY, { correct: true, difficulty: 3, hintsUsed: 1, timeRatio: 1 });
    expect(hint.theta).toBeLessThan(noHint.theta);
  });
  it("tracks a running time ratio with outliers capped", () => {
    const s = updateMastery(INITIAL_MASTERY, { correct: true, difficulty: 3, hintsUsed: 0, timeRatio: 50 });
    expect(s.avgTimeRatio).toBe(5);
  });
});

describe("selection", () => {
  it("targets ~70% predicted success", () => {
    expect(targetDifficulty(0)).toBeCloseTo(-0.847, 2);
  });
  it("prefers weak, heavy topics", () => {
    const rng = seededRng(1);
    const counts = { weak: 0, strong: 0 };
    for (let i = 0; i < 2000; i++) {
      const t = pickTopic(
        [
          { topicId: "weak", weight: 1, theta: -2, attempts: 20, available: 5 },
          { topicId: "strong", weight: 1, theta: 3, attempts: 20, available: 5 },
        ],
        rng,
      );
      counts[t as "weak" | "strong"]++;
    }
    expect(counts.weak).toBeGreaterThan(counts.strong * 4);
  });
  it("skips topics with nothing available", () => {
    expect(pickTopic([{ topicId: "a", weight: 1, theta: 0, attempts: 0, available: 0 }], seededRng(1))).toBeUndefined();
  });
  it("picks questions near the target difficulty", () => {
    const qs = [1, 2, 3, 4, 5].map((d) => ({ id: `q${d}`, difficulty: d }));
    // theta 1.85 → target ≈ 1.0 logit → difficulty 4 (±0.5 logit window keeps only d=4)
    expect(pickQuestion(1.85, qs, seededRng(3))?.id).toBe("q4");
    expect(pickQuestion(0, [], seededRng(3))).toBeUndefined();
  });
  it("is reproducible for a seed", () => {
    const a = seededRng(42), b = seededRng(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe("review", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  it("schedules 1 → 2.5 → 6.25 days and retires after 3 successes", () => {
    let s = newReview(now);
    expect(s.intervalDays).toBe(1);
    s = applyReviewResult(s, true, now);
    expect(s.intervalDays).toBe(2.5);
    s = applyReviewResult(s, true, now);
    expect(s.intervalDays).toBe(6.25);
    s = applyReviewResult(s, true, now);
    expect(s.retired).toBe(true);
  });
  it("resets on a lapse and flags stuck after 3", () => {
    let s = newReview(now);
    for (let i = 0; i < 3; i++) s = applyReviewResult(s, false, now);
    expect(s.intervalDays).toBe(1);
    expect(isStuck(s)).toBe(true);
  });
});

describe("recommendations", () => {
  it("ranks weak topics by weight × gap and ignores thin data", () => {
    const w = weakTopics([
      { topicId: "heavy-weak", weight: 2, theta: -1, attempts: 10 },
      { topicId: "light-weak", weight: 0.5, theta: -1, attempts: 10 },
      { topicId: "strong", weight: 2, theta: 3, attempts: 10 },
      { topicId: "unknown", weight: 2, theta: -3, attempts: 1 },
    ]);
    expect(w.map((x) => x.topicId)).toEqual(["heavy-weak", "light-weak"]);
  });
  it("summarises signals and recurring misconceptions", () => {
    const b = signalBreakdown(["careless", "careless", "error", "solid"]);
    expect(b[0]).toEqual({ signal: "careless", count: 2, share: 2 / 3 });
    expect(recurringMisconceptions(["a", "a", "b", null])).toEqual([{ misconceptionId: "a", count: 2 }]);
  });
});
