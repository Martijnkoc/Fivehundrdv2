/*
 * Where a visit came from and on what, decided on the server from what the
 * browser tells us (referrer host, utm_ tags) and the request (user agent).
 * Pure functions, so the rules are tested (attribution.test.mjs).
 */

/** Referrer hosts and utm_source spellings → one source name. */
const SOURCES: [RegExp, string][] = [
  [/(^|\.)instagram\.com$|^ig$|^insta(gram)?$/, "instagram"],
  [/(^|\.)tiktok\.com$|^tiktok$|^tt$/, "tiktok"],
  [/(^|\.)(twitter|x)\.com$|^t\.co$|^(twitter|x)$/, "x"],
  [/(^|\.)facebook\.com$|^fb(\.me)?$|^l\.facebook\.com$|^facebook$|^m\.facebook\.com$/, "facebook"],
  [/(^|\.)threads\.net$|^threads$/, "threads"],
  [/(^|\.)linkedin\.com$|^lnkd\.in$|^linkedin$/, "linkedin"],
  [/(^|\.)reddit\.com$|^reddit$/, "reddit"],
  [/(^|\.)youtube\.com$|^youtu\.be$|^youtube$/, "youtube"],
  [/(^|\.)pinterest\.[a-z.]+$|^pinterest$/, "pinterest"],
  [/(^|\.)whatsapp\.com$|^wa\.me$|^whatsapp$/, "whatsapp"],
  [/(^|\.)t\.me$|(^|\.)telegram\.org$|^telegram$/, "telegram"],
  [/(^|\.)discord(app)?\.com$|^discord$/, "discord"],
  [/(^|\.)bsky\.app$|^bluesky$/, "bluesky"],
  [/(^|\.)google\.[a-z.]+$|^google$/, "google"],
  [/(^|\.)bing\.com$|^bing$/, "bing"],
  [/(^|\.)duckduckgo\.com$|^duckduckgo$/, "duckduckgo"],
  [/(^|\.)news\.ycombinator\.com$|^hn$|^hackernews$/, "hackernews"],
  [/(^|\.)producthunt\.com$|^producthunt$/, "producthunt"],
  [/mail|newsletter|substack\.com$|^email$/, "email"],
];

export function sourceOf(referrer: string | undefined, utmSource: string | undefined): string {
  const raw = (utmSource || referrer || "").trim().toLowerCase().replace(/^www\./, "");
  if (!raw) return "direct";
  for (const [re, name] of SOURCES) if (re.test(raw)) return name;
  return raw.replace(/[^a-z0-9._-]/g, "").slice(0, 60) || "direct";
}

export function deviceOf(ua: string | null | undefined): "mobile" | "tablet" | "desktop" {
  const u = ua ?? "";
  if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(u)) return "tablet";
  if (/Mobi|iPhone|iPod|Android|BlackBerry|Opera Mini|IEMobile/i.test(u)) return "mobile";
  return "desktop";
}

/** Crawlers and link previewers aren't visitors. */
export const isBot = (ua: string | null | undefined) =>
  !ua || /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|headless|lighthouse|pingdom|monitor|curl|wget|python-requests/i.test(ua);

/** A two-letter country from the platform's geo header (Vercel), or nothing. */
export const countryOf = (h: string | null | undefined) => (h && /^[A-Z]{2}$/.test(h) && h !== "XX" ? h : undefined);
