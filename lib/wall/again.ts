import type { MakerNumbers } from "../site/reminderEmail";
import { mediaURL } from "./live";
import type { LaneId, Link } from "./model";

/*
 * "Put it on again" (founder's ask, 2026-10-02): after its 72 hours a maker
 * sees how their spot did, in the site, and can place the same story again.
 * A new spot and 72 hours, paid again: nothing renews by itself, and the
 * wall keeps turning over.
 */

/** A maker's story that ended, as /api/mine/ended returns it (maker_ended). */
export type EndedStory = {
  id: string;
  slug: string;
  lane: LaneId;
  no: number;
  name: string;
  snippet: string | null;
  artwork: string | null;
  logo: string | null;
  audio: string | null;
  excerptTitle: string | null;
  excerpt: string | null;
  trailerUrl: string | null;
  links: Link[];
  seed: number;
  pal: number;
  startsAt?: string;
  endsAt: string;
  stats: MakerNumbers;
  /** its lane's other spots that ended in the 30 days before it, and how many had fewer opens */
  standing?: { peers: number; fewer: number };
  audioTitle?: string;
  milestone?: string;
  milestoneOn?: string;
  gallery?: string[];
};

/** What the Create form starts from: the story as it was, its files by their public address. */
export type Prefill = {
  name: string;
  snippet: string;
  links: string[];
  img: string | null;
  logo: string | null;
  audio: string | null;
  exT: string;
  ex: string;
  trailer: string;
  audioTitle: string;
  milestone: string;
  milestoneOn: string;
  gallery: string[];
};

export function prefillFrom(e: EndedStory, base: string): Prefill {
  const links = e.links.slice(0, 3).map((l) => l.url.replace(/^https?:\/\//, ""));
  while (links.length < 3) links.push("");
  return {
    name: e.name,
    snippet: e.snippet ?? "",
    links,
    img: mediaURL(base, "art", e.artwork),
    logo: mediaURL(base, "art", e.logo),
    audio: mediaURL(base, "audio", e.audio),
    exT: e.excerptTitle ?? "",
    ex: e.excerpt ?? "",
    trailer: e.trailerUrl ?? "",
    audioTitle: e.audioTitle ?? "",
    /* a date that has passed isn't carried into a new spot */
    milestone: e.milestone ?? "",
    milestoneOn: e.milestoneOn && e.milestoneOn >= new Date().toISOString().slice(0, 10) ? e.milestoneOn : "",
    gallery: (e.gallery ?? []).map((p) => mediaURL(base, "art", p)).filter((u): u is string => !!u),
  };
}

/**
 * How an ended spot did next to its lane, in words: only when at least 20
 * other spots ended in its lane that month (small samples get no verdict),
 * and only when it's something worth saying.
 */
export function standingLine(st: { peers: number; fewer: number } | undefined, lane: string): string | null {
  if (!st || st.peers < 20) return null;
  const share = st.fewer / st.peers;
  if (share >= 0.9) return `Opened more than almost every ${lane} spot this month.`;
  if (share >= 0.75) return `Opened more than most ${lane} spots this month.`;
  if (share >= 0.5) return `Opened more than half the ${lane} spots this month.`;
  return null;
}

/** Its old number if that's open in its lane again, otherwise none (the form picks an open one). */
export function sameNumber(e: Pick<EndedStory, "no">, open: readonly number[]) {
  return open.includes(e.no) ? e.no : null;
}

/** The newest ended story to show, unless the maker already has one live (that one shows instead). */
export function endedToShow(ended: readonly EndedStory[], hasLive: boolean) {
  return hasLive ? null : (ended[0] ?? null);
}
