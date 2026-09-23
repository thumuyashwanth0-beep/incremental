import { describe, expect, it } from "vitest";
import { checkRateLimit } from "./rate-limit";

describe("checkRateLimit", () => {
  it("allows up to the limit per window, then resets", () => {
    const key = `t:${Math.random()}`;
    const t0 = 1_000_000;
    expect([1, 2, 3].map(() => checkRateLimit(key, 2, 60, t0))).toEqual([true, true, false]);
    expect(checkRateLimit(key, 2, 60, t0 + 61_000)).toBe(true);
  });
});
