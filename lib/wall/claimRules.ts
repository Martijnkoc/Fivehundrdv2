/*
 * §13 / §15: what a claim may contain. The Create form checks the same things
 * first (with the reference's messages); the server re-checks every request,
 * and the database has the same limits as constraints.
 */
import { parseLink } from "./links";
import { LANE, type LaneId, type Link } from "./model";

export type ClaimRequest = {
  lane: LaneId;
  no: number;
  name: string;
  snippet?: string;
  links: string[];
  artwork?: string | null;
  logo?: string | null;
  audio?: string | null;
  excerptTitle?: string;
  excerpt?: string;
  trailerUrl?: string;
  /** Music, Podcasts: what the clip is from ("Night Bus EP") */
  audioTitle?: string;
  /** something coming up ("Album out"), with a date (YYYY-MM-DD) or without */
  milestone?: string;
  milestoneOn?: string;
  /** Art, Games: up to two more images, uploaded like the artwork */
  gallery?: (string | null)[];
  seed: number;
  pal: number;
  email?: string;
  visitor?: string;
};

/** Media is uploaded under pending/<random>.<ext> before paying. */
const MEDIA_PATH = /^pending\/[a-z0-9-]{16,64}\.(jpg|jpeg|png|webp|gif|mp3|m4a|mp4|aac|wav|ogg|webm)$/;

export type CheckedClaim = {
  lane: LaneId;
  no: number;
  name: string;
  snippet: string;
  links: Link[];
  artwork: string | null;
  logo: string | null;
  audio: string | null;
  excerptTitle: string;
  excerpt: string;
  trailerUrl: string;
  audioTitle: string;
  milestone: string;
  milestoneOn: string;
  gallery: string[];
  seed: number;
  pal: number;
  email: string;
  visitor: string;
};

/** What a maker may change in a live spot's first hour: its words and links, never its files, lane or number. */
export type CheckedWords = Pick<
  CheckedClaim,
  "name" | "snippet" | "links" | "excerptTitle" | "excerpt" | "trailerUrl" | "audioTitle" | "milestone" | "milestoneOn"
>;

/** A milestone date: a real day, from yesterday (time zones) to about a year ahead. */
function day(v: unknown, now: number): string | null {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const t = Date.parse(s + "T00:00:00Z");
  if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== s) return null;
  return t >= now - 2 * 86400e3 && t <= now + 400 * 86400e3 ? s : null;
}

/** The words and links of a story in `lane`, as the form and the database allow them. */
export function checkWords(body: unknown, lane: LaneId, now = Date.now()): CheckedWords | { error: string } {
  const b = (body ?? {}) as Partial<ClaimRequest>;
  const name = String(b.name ?? "").trim();
  if (!name || name.length > 40) return { error: "Add your name so people know who they're looking at." };
  const links = (Array.isArray(b.links) ? b.links : []).slice(0, 3).map((v) => parseLink(String(v))).filter((l): l is Link => !!l);
  if (!links.length) return { error: "Add at least one link, so visitors can go and find you." };
  const snippet = String(b.snippet ?? "").trim();
  if (snippet.length > 140) return { error: "snippet" };
  const reads = lane === "writers" || lane === "letters";
  const excerptTitle = reads ? String(b.excerptTitle ?? "").trim().slice(0, 60) : "";
  const excerpt = reads ? String(b.excerpt ?? "").trim() : "";
  if (excerpt.length > 2500) return { error: "excerpt" };
  const watches = lane === "art" || lane === "games";
  const trailer = watches && b.trailerUrl ? parseLink(String(b.trailerUrl)) : null;
  const hears = lane === "music" || lane === "podcasts";
  const audioTitle = hears ? String(b.audioTitle ?? "").trim() : "";
  if (audioTitle.length > 60) return { error: "audioTitle" };
  const milestone = String(b.milestone ?? "").trim();
  if (milestone.length > 48) return { error: "milestone" };
  const on = day(b.milestoneOn, now);
  if (on === null) return { error: "That date doesn't look right. Pick a day in the coming year." };
  return { name, snippet, links, excerptTitle: excerpt ? excerptTitle : "", excerpt, trailerUrl: trailer?.url ?? "", audioTitle, milestone, milestoneOn: milestone ? on : "" };
}

export function checkClaim(body: unknown, now = Date.now()): CheckedClaim | { error: string } {
  const b = (body ?? {}) as Partial<ClaimRequest>;
  const lane = b.lane as LaneId;
  if (!lane || !(lane in LANE)) return { error: "lane" };
  const no = Number(b.no);
  if (!Number.isInteger(no) || no < 1 || no > 500) return { error: "no" };
  const words = checkWords(b, lane, now);
  if ("error" in words) return words;
  const media = (v: unknown) => {
    const s = v == null || v === "" ? null : String(v);
    return s === null || MEDIA_PATH.test(s) ? { ok: s } : null;
  };
  const artwork = media(b.artwork),
    logo = media(b.logo),
    audio = media(b.audio);
  if (!artwork || !logo || !audio) return { error: "media" };
  const shows = lane === "art" || lane === "games";
  const more = shows && Array.isArray(b.gallery) ? b.gallery.slice(0, 2).map(media) : [];
  if (more.some((m) => !m || (m.ok && !/\.(jpg|jpeg|png|webp|gif)$/.test(m.ok)))) return { error: "media" };
  const seed = Math.floor(Number(b.seed));
  const pal = Math.floor(Number(b.pal));
  if (!Number.isFinite(seed) || seed < 0 || !Number.isInteger(pal) || pal < 0 || pal > 11) return { error: "pattern" };
  return {
    lane,
    no,
    ...words,
    artwork: artwork.ok,
    logo: logo.ok,
    audio: lane === "music" || lane === "podcasts" ? audio.ok : null,
    gallery: more.map((m) => m!.ok).filter((v): v is string => !!v),
    seed,
    pal,
    email: String(b.email ?? "").trim().slice(0, 200),
    visitor: String(b.visitor ?? "").slice(0, 64),
  };
}
