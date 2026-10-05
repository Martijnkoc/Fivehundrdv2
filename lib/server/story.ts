import "server-only";
import { cache } from "react";
import type { Feed, FeedStory } from "../wall/live";
import { hasDatabase, rpc } from "./backend";

export type PublicStory = FeedStory & { slug: string; state: "live" | "ended" };

/** One story by its code (live or ended), once per request. */
export const storyBySlug = cache(async (slug: string): Promise<PublicStory | null> => {
  if (!/^[a-z0-9]{8}$/.test(slug) || !hasDatabase()) return null;
  return rpc<PublicStory | null>("story_public", { p_slug: slug }, false).catch(() => null);
});

let wallMemo: { at: number; feed: Promise<Feed> } | null = null;
/**
 * The whole live wall (wall_public), shared for 15 seconds by every request
 * this server instance handles: a shared spot's preview and a report only
 * need one story, and a busy minute shouldn't pull the full wall per request.
 */
export function wallFeed(fresh = false): Promise<Feed> {
  const now = Date.now();
  /* `fresh`: a maker looking for the spot they just placed; at most one extra read every 2 seconds */
  if (!wallMemo || now - wallMemo.at > (fresh ? 2e3 : 15e3)) {
    const feed = rpc<Feed>("wall_public", {}, false);
    wallMemo = { at: now, feed };
    /* a failed read isn't kept */
    feed.catch(() => wallMemo?.feed === feed && (wallMemo = null));
  }
  return wallMemo.feed;
}
