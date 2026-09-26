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
  seed: number;
  pal: number;
  email: string;
  visitor: string;
};

export function checkClaim(body: unknown): CheckedClaim | { error: string } {
  const b = (body ?? {}) as Partial<ClaimRequest>;
  const lane = b.lane as LaneId;
  if (!lane || !(lane in LANE)) return { error: "lane" };
  const no = Number(b.no);
  if (!Number.isInteger(no) || no < 1 || no > 500) return { error: "no" };
  const name = String(b.name ?? "").trim();
  if (!name || name.length > 40) return { error: "Add your name so people know who they're looking at." };
  const links = (Array.isArray(b.links) ? b.links : []).slice(0, 3).map((v) => parseLink(String(v))).filter((l): l is Link => !!l);
  if (!links.length) return { error: "Add at least one link, so visitors can go and find you." };
  const snippet = String(b.snippet ?? "").trim();
  if (snippet.length > 140) return { error: "snippet" };
  const media = (v: unknown) => {
    const s = v == null || v === "" ? null : String(v);
    return s === null || MEDIA_PATH.test(s) ? { ok: s } : null;
  };
  const artwork = media(b.artwork),
    logo = media(b.logo),
    audio = media(b.audio);
  if (!artwork || !logo || !audio) return { error: "media" };
  const reads = lane === "writers" || lane === "letters";
  const excerptTitle = reads ? String(b.excerptTitle ?? "").trim().slice(0, 60) : "";
  const excerpt = reads ? String(b.excerpt ?? "").trim() : "";
  if (excerpt.length > 2500) return { error: "excerpt" };
  const watches = lane === "art" || lane === "games";
  const trailer = watches && b.trailerUrl ? parseLink(String(b.trailerUrl)) : null;
  const seed = Math.floor(Number(b.seed));
  const pal = Math.floor(Number(b.pal));
  if (!Number.isFinite(seed) || seed < 0 || !Number.isInteger(pal) || pal < 0 || pal > 11) return { error: "pattern" };
  return {
    lane,
    no,
    name,
    snippet,
    links,
    artwork: artwork.ok,
    logo: logo.ok,
    audio: lane === "music" || lane === "podcasts" ? audio.ok : null,
    excerptTitle: excerpt ? excerptTitle : "",
    excerpt,
    trailerUrl: trailer?.url ?? "",
    seed,
    pal,
    email: String(b.email ?? "").trim().slice(0, 200),
    visitor: String(b.visitor ?? "").slice(0, 64),
  };
}
