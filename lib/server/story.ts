import "server-only";
import { cache } from "react";
import type { FeedStory } from "../wall/live";
import { hasDatabase, rpc } from "./backend";

export type PublicStory = FeedStory & { slug: string; state: "live" | "ended" };

/** One story by its code (live or ended), once per request. */
export const storyBySlug = cache(async (slug: string): Promise<PublicStory | null> => {
  if (!/^[a-z0-9]{8}$/.test(slug) || !hasDatabase()) return null;
  return rpc<PublicStory | null>("story_public", { p_slug: slug }, false).catch(() => null);
});
