/* Numbers as people read them. Money is in cents (USD, the wall's currency). */

export const int = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "—" : Math.round(n).toLocaleString("en-US"));

export function compact(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M";
  if (a >= 1e4) return (n / 1e3).toFixed(a >= 1e5 ? 0 : 1).replace(/\.0$/, "") + "k";
  return int(n);
}

export function pct(x: number | null | undefined, digits = 1) {
  if (x == null || !Number.isFinite(x)) return "—";
  const v = x * 100;
  return (Math.abs(v) >= 10 || digits === 0 ? v.toFixed(0) : v.toFixed(digits)).replace(/\.0$/, "") + "%";
}

export function money(cents: number | null | undefined, exact = false) {
  if (cents == null || !Number.isFinite(cents)) return "—";
  const d = cents / 100;
  if (!exact && Math.abs(d) >= 10000) return "$" + compact(d);
  return d.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function bytes(n: number | null | undefined) {
  if (n == null) return "—";
  if (n >= 1 << 30) return (n / (1 << 30)).toFixed(1) + " GB";
  if (n >= 1 << 20) return (n / (1 << 20)).toFixed(1) + " MB";
  if (n >= 1 << 10) return Math.round(n / (1 << 10)) + " KB";
  return n + " B";
}

export function ms(n: number | null | undefined) {
  if (n == null) return "—";
  return n >= 1000 ? (n / 1000).toFixed(1) + " s" : Math.round(n) + " ms";
}

/** "3 min ago", "2 h ago", "Sep 24". */
export function ago(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return "never";
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return Math.round(s / 60) + " min ago";
  if (s < 86400) return Math.round(s / 3600) + " h ago";
  if (s < 7 * 86400) return Math.round(s / 86400) + " d ago";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** A ratio, or null when there's nothing to divide by. */
export const rate = (a: number, b: number) => (b > 0 ? a / b : null);

/** Change against the previous period: relative for counts, in points for rates. */
export function change(now: number | null, prev: number | null | undefined, kind: "count" | "rate" | "money" = "count") {
  if (now == null || prev == null) return null;
  if (kind === "rate") return { value: now - prev, label: `${now - prev >= 0 ? "+" : "−"}${Math.abs((now - prev) * 100).toFixed(1)} pts` };
  if (prev === 0) return now === 0 ? { value: 0, label: "no change" } : { value: 1, label: "new" };
  const r = (now - prev) / prev;
  return { value: r, label: `${r >= 0 ? "+" : "−"}${pct(Math.abs(r))}` };
}

/** Labels for chart axes from "YYYY-MM-DDTHH:MI". */
export function tickLabel(t: string, bucket: "hour" | "day") {
  const d = new Date(t.slice(0, 10) + "T12:00:00Z");
  if (bucket === "hour") return t.slice(11, 16);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
export function longLabel(t: string, bucket: "hour" | "day") {
  const d = new Date(t.slice(0, 10) + "T12:00:00Z");
  const day = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  return bucket === "hour" ? `${day}, ${t.slice(11, 16)}` : day;
}

export type Fmt = "int" | "dec" | "money" | "pct";
export const fmt = (f: Fmt, v: number | null | undefined, short = false) =>
  v == null ? "—" : f === "dec" ? v.toFixed(2) : f === "money" ? money(v, !short) : f === "pct" ? pct(v) : short ? compact(v) : int(v);
