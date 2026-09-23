import katex from "katex";

/**
 * Renders question/solution text (a small Markdown subset + LaTeX) to SAFE HTML.
 * This is the ONLY function whose output may go into dangerouslySetInnerHTML (docs/SECURITY.md).
 *
 * Supported: paragraphs (blank line), line breaks, **bold**, *italic*, `- ` bullet and `1. ` numbered
 * lists, inline math $..$ or \(..\), display math $$..$$ or \[..\].
 * All non-math text is HTML-escaped; KaTeX runs with trust:false so \href, \url, \htmlClass etc. are inert.
 */

const MATH_RE = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$((?:\\\$|[^$\n])+?)\$/g;

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function renderMath(tex: string, displayMode: boolean): string {
  return katex.renderToString(tex, {
    displayMode,
    throwOnError: false,
    trust: false,
    strict: "ignore",
    maxSize: 20,
    maxExpand: 500,
    output: "html",
  });
}

function inlineMarkdown(escaped: string): string {
  return escaped
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, "$1<em>$2</em>");
}

/** Replace math with placeholders so markdown processing can't touch it. */
function extractMath(src: string): { text: string; math: string[] } {
  const math: string[] = [];
  const text = src.replace(MATH_RE, (_m, dd, bracket, paren, single) => {
    const display = dd !== undefined || bracket !== undefined;
    math.push(renderMath((dd ?? bracket ?? paren ?? single).trim(), display));
    return `\u0000${math.length - 1}\u0000`;
  });
  return { text, math };
}

export function renderRich(src: string): string {
  const { text, math } = extractMath(src.replace(/\r\n/g, "\n"));
  const blocks = text.split(/\n{2,}/).map((block) => {
    const lines = block.split("\n").filter((l) => l.trim() !== "");
    if (!lines.length) return "";
    const bullet = lines.every((l) => /^\s*[-*] /.test(l));
    const numbered = lines.every((l) => /^\s*\d+[.)] /.test(l));
    if (bullet || numbered) {
      const tag = bullet ? "ul" : "ol";
      const items = lines.map((l) => `<li>${inlineMarkdown(escapeHtml(l.replace(/^\s*([-*]|\d+[.)]) /, "")))}</li>`);
      return `<${tag}>${items.join("")}</${tag}>`;
    }
    return `<p>${lines.map((l) => inlineMarkdown(escapeHtml(l))).join("<br/>")}</p>`;
  });
  // Placeholders survived escaping unchanged (\u0000 and digits aren't escaped).
  return blocks.join("").replace(/\u0000(\d+)\u0000/g, (_m, i) => math[Number(i)]);
}
