/** Fetch all rows of a Hugging Face dataset split via the datasets-server API (paginated). */
export async function fetchHfRows<T>(dataset: string, config: string, split: string): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 100) {
    const url = `https://datasets-server.huggingface.co/rows?dataset=${encodeURIComponent(dataset)}&config=${config}&split=${split}&offset=${offset}&length=100`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    const data = (await res.json()) as { rows: { row: T }[]; num_rows_total: number };
    rows.push(...data.rows.map((r) => r.row));
    if (rows.length >= data.num_rows_total || !data.rows.length) return rows;
  }
}

/** Normalise dataset LaTeX: drop layout-only environments and collapse blank-line noise. */
export function normaliseLatex(s: string): string {
  return s
    .replace(/\\begin\{center\}|\\end\{center\}/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Splits "stem ... (A) x (B) y (C) z (D) w" into a stem and four options. Null if not exactly A-D. */
export function splitLabelledOptions(q: string): { stem: string; options: { key: "A" | "B" | "C" | "D"; text: string }[] } | null {
  const parts = q.split(/\n\s*\(([A-D])\)\s*/);
  if (parts.length !== 9) return null;
  const keys = [parts[1], parts[3], parts[5], parts[7]];
  if (keys.join("") !== "ABCD") return null;
  return {
    stem: parts[0].trim(),
    options: keys.map((k, i) => ({ key: k as "A" | "B" | "C" | "D", text: parts[2 + i * 2].trim() })),
  };
}
