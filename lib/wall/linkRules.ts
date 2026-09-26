/* §13: rules every link on the wall must pass (checked again on the server). */

/* Short links hide where they go, so the wall only takes the real address. */
const SHORTENERS = new Set([
  "bit.ly", "tinyurl.com", "t.co", "goo.gl", "is.gd", "cutt.ly", "rb.gy", "shorturl.at", "ow.ly", "buff.ly",
  "tiny.cc", "t.ly", "rebrand.ly", "s.id", "v.gd", "bl.ink", "short.io", "lnkd.in", "tr.im", "qr.ae",
]);

/** Rules any link must pass; returns problems (empty when fine). */
export function linkProblems(raw: string): string[] {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return ["not a web address"];
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const out: string[] = [];
  if (u.protocol !== "https:" && u.protocol !== "http:") out.push("not a web address");
  if (u.username || u.password) out.push("hides where it goes");
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":") || host === "localhost" || !host.includes("."))
    out.push("points at a bare server address");
  if (SHORTENERS.has(host)) out.push("is a short link");
  return out;
}
