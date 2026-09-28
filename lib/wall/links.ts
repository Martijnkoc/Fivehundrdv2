import type { Link } from "./model";

/* §6: links are labelled by their domain. */
const DOMAINS: [string, string][] = [
  ["spotify", "Spotify"],
  ["bandcamp", "Bandcamp"],
  ["soundcloud", "SoundCloud"],
  ["music.apple", "Apple Music"],
  ["podcasts.apple", "Apple Podcasts"],
  ["youtube", "YouTube"],
  ["youtu.be", "YouTube"],
  ["instagram", "Instagram"],
  ["tiktok", "TikTok"],
  ["substack", "Substack"],
  ["steampowered", "Steam"],
  ["itch.io", "itch.io"],
  ["goodreads", "Goodreads"],
  ["x.com", "X"],
  ["twitter", "X"],
  ["discord", "Discord"],
  ["patreon", "Patreon"],
  ["behance", "Behance"],
  ["webtoons", "Webtoon"],
];

/** A typed link as { label, url }, or null if it isn't a web address. */
export function parseLink(v: string | null | undefined): Link | null {
  v = (v || "").trim();
  if (!v) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : "https://" + v);
    if (!u.hostname.includes(".")) return null;
    const h = u.hostname.replace(/^www\./, "");
    const hit = DOMAINS.find(([k]) => h.includes(k));
    return { label: hit ? hit[1] : h, url: u.href };
  } catch {
    return null;
  }
}
