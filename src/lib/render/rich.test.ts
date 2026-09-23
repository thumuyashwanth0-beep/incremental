import { describe, expect, it } from "vitest";
import { renderRich } from "./rich";

describe("renderRich", () => {
  it("escapes HTML in text", () => {
    const html = renderRich(`<img src=x onerror=alert(1)> and <script>alert(1)</script>`);
    expect(html).not.toMatch(/<img|<script/);
    expect(html).toContain("&lt;script&gt;");
  });
  it("renders inline and display math", () => {
    expect(renderRich("Speed $v = u + at$ here")).toContain('class="katex"');
    expect(renderRich("$$\\int_0^1 x\\,dx$$")).toContain("katex-display");
    expect(renderRich("PW style \\(\\frac{1}{2}\\)")).toContain('class="katex"');
  });
  it("does not execute trust-gated KaTeX commands", () => {
    const html = renderRich("$\\href{javascript:alert(1)}{click}$");
    expect(html).not.toContain('href="javascript');
  });
  it("does not let markdown rewrite math", () => {
    expect(renderRich("$a*b*c$")).not.toContain("<em>");
  });
  it("renders lists and emphasis", () => {
    const html = renderRich("1. First **bold**\n2. Second *it*");
    expect(html).toBe("<ol><li>First <strong>bold</strong></li><li>Second <em>it</em></li></ol>");
  });
  it("survives malformed LaTeX", () => {
    expect(() => renderRich("$\\frac{1}{$")).not.toThrow();
  });
});
