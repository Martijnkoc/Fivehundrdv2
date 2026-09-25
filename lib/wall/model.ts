/* Constants, types and lane bindings from reference.html (BUILD_BRIEF §4). */

export const TOTAL = 500;
export const LIFE = 72 * 3600e3;
export const PRICE = "$9.95";

export type LaneId = "music" | "art" | "writers" | "podcasts" | "games" | "letters";
export type NavId = LaneId | "all";

/** Lane order used by the demo data, the card chips and the Create form. */
export const LANES: [LaneId, string][] = [
  ["music", "Music"],
  ["art", "Creators"],
  ["writers", "Books"],
  ["podcasts", "Podcasts"],
  ["games", "Games"],
  ["letters", "Newsletters"],
];
export const LANE = Object.fromEntries(LANES) as Record<LaneId, string>;

/** Header and footer tab order. */
export const NAV: [NavId, string][] = [
  ["all", "Wall"],
  ["music", "Music"],
  ["writers", "Books"],
  ["games", "Games"],
  ["art", "Creators"],
  ["podcasts", "Podcasts"],
  ["letters", "Newsletters"],
];

export type Palette = [string, string, string];
export type Link = { label: string; url: string };
export type Excerpt = { t: string; s?: string; x: string };

export type FilledSpot = {
  no: number;
  vacant?: false;
  lane: LaneId;
  name: string;
  snippet: string;
  start: number;
  seed: number;
  pal: Palette;
  links: Link[];
  opens: number;
  saves: number;
  demo?: boolean;
  mine?: boolean;
  img?: string | null;
  logo?: string | null;
  audio?: string | null;
  excerpt?: Excerpt | null;
  trailer?: { url: string; len: string } | null;
};
export type VacantSpot = { no: number; vacant: true };
export type Spot = FilledSpot | VacantSpot;

/** One binding per lane, all from the fivehundrd palette. */
export const BIND: Record<LaneId, { c1: string; c2: string; c3: string; pill?: string; pillt?: string }> = {
  music: { c1: "#ff7bc3", c3: "#0d0d0d", c2: "#ff7bc3", pill: "#0d0d0d", pillt: "#ff7bc3" },
  podcasts: { c1: "#6e1f48", c3: "#ff7bc3", c2: "#ff7bc3" },
  games: { c1: "#d8ff45", c3: "#0d0d0d", c2: "#d8ff45" },
  art: { c1: "#3b4712", c3: "#d8ff45", c2: "#d8ff45" },
  writers: { c1: "#151412", c3: "#ff7bc3", c2: "#ff7bc3" },
  letters: { c1: "#ece0c2", c3: "#0d0d0d", c2: "#ff7bc3" },
};

export const pad = (n: number) => String(n).padStart(3, "0");

export const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Mulberry32, the reference's seeded generator. */
export function rng(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Relative luminance; above 0.28 text on that colour sits dark (§4). */
export function lum(h: string) {
  const n = parseInt(h.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

export const fmt = (n?: number) => {
  n = n || 0;
  return n >= 1e4 ? Math.round(n / 1e3) + "k" : n >= 1e3 ? (n / 1e3).toFixed(1).replace(".0", "") + "k" : String(n);
};
