/* CSV for the export centre: UTF-8 with a BOM (Excel opens it right), quoted
 * where needed, and text that looks like a formula is defused. */

export type CsvTable = { cols: { key: string; label: string }[]; rows: Record<string, unknown>[] };

const cell = (v: unknown) => {
  if (v == null) return "";
  const s = typeof v === "number" ? String(Math.round(v * 1e6) / 1e6) : String(v);
  /* quoted, and never read as a formula by a spreadsheet */
  const safe = /^[=+\-@\t\r]/.test(s) && typeof v !== "number" ? "'" + s : s;
  return /[",\n\r]/.test(safe) || safe !== s ? `"${safe.replace(/"/g, '""')}"` : safe;
};
export function toCsv(t: CsvTable) {
  return "\ufeff" + [t.cols.map((c) => cell(c.label)).join(","), ...t.rows.map((r) => t.cols.map((c) => cell(r[c.key])).join(","))].join("\r\n") + "\r\n";
}

