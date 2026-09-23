/**
 * Renders HTML produced by renderRich() (src/lib/render/rich.ts). NEVER pass any other string here.
 * Use as="span" inside buttons and other phrasing-only contexts.
 */
export function RichHtml({ html, className, as: Tag = "div" }: { html: string; className?: string; as?: "div" | "span" }) {
  return <Tag className={`rich ${Tag === "span" ? "block" : ""} ${className ?? ""}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
