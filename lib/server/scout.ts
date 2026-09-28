import "server-only";
import { cache } from "react";
import type { LaneId } from "../wall/model";
import type { Tier } from "../wall/scout";
import { hasDatabase, rpc } from "./backend";

/*
 * Shared Scout Cards and calls (docs/scout.md), by their link. Only what the
 * card shows, only while its Scout shares it: scout_public and
 * scout_call_public return nothing otherwise.
 */
type Art = { artwork: string | null; logo: string | null; seed: number; pal: number };
export type PublicScout = {
  name: string;
  since: string;
  tier: Tier | null;
  percentile: number | null;
  calls: number;
  early: number;
  hotspots: number;
  best: (Art & { name: string; lane: LaneId; no: number; slug: string; position: number; keepersThen: number; keepersNow: number; hotspot: boolean }) | null;
};
export type PublicCall = Art & {
  scout: string;
  tier: Tier | null;
  percentile: number | null;
  name: string;
  lane: LaneId;
  no: number;
  slug: string;
  position: number;
  keepersThen: number;
  keepersNow: number;
  hotspot: boolean;
  calledAt: string;
};

const SCOUT_SLUG = /^[a-z0-9]{16}$/;
const STORY_SLUG = /^[a-z0-9]{8}$/;

export const scoutBySlug = cache(async (slug: string): Promise<PublicScout | null> => {
  if (!SCOUT_SLUG.test(slug) || !hasDatabase()) return null;
  return rpc<PublicScout | null>("scout_public", { p_slug: slug }, false).catch(() => null);
});

export const scoutCall = cache(async (slug: string, story: string): Promise<PublicCall | null> => {
  if (!SCOUT_SLUG.test(slug) || !STORY_SLUG.test(story) || !hasDatabase()) return null;
  return rpc<PublicCall | null>("scout_call_public", { p_slug: slug, p_story_slug: story }, false).catch(() => null);
});

const TIERS: Record<Tier, string> = { gold: "Gold Scout", silver: "Silver Scout", bronze: "Bronze Scout" };
/** "Top 8% · Silver Scout", or plainly "Fivehundrd Scout" (no tier: no number). */
export const standing = (s: { tier: Tier | null; percentile: number | null }) =>
  s.tier && s.percentile ? `Top ${s.percentile}% · ${TIERS[s.tier]}` : "Fivehundrd Scout";
