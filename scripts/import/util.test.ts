import { describe, expect, it } from "vitest";
import { splitLabelledOptions } from "./util";

describe("splitLabelledOptions", () => {
  it("splits JEEBench-style option blocks", () => {
    const r = splitLabelledOptions("Find x.\n\n(A) $1$\n\n(B) $2$\n\n(C) $3$\n\n(D) $4$");
    expect(r?.stem).toBe("Find x.");
    expect(r?.options.map((o) => o.text)).toEqual(["$1$", "$2$", "$3$", "$4$"]);
  });
  it("returns null when options are not exactly A-D", () => {
    expect(splitLabelledOptions("Find x.\n(A) 1\n(B) 2")).toBeNull();
  });
});
