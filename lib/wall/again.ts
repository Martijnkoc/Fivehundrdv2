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
  endsAt: string;
  stats: MakerNumbers;
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
  };
}

/** Its old number if that's open in its lane again, otherwise none (the form picks an open one). */
export function sameNumber(e: Pick<EndedStory, "no">, open: readonly number[]) {
  return open.includes(e.no) ? e.no : null;
}

/** The newest ended story to show, unless the maker already has one live (that one shows instead). */
export function endedToShow(ended: readonly EndedStory[], hasLive: boolean) {
  return hasLive ? null : (ended[0] ?? null);
}
