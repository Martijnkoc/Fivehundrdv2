import type { LaneId, Link, Palette, Spot } from "./model";
import { left } from "./time";

/* §11: a save is keyed by story, not spot number, so it survives the spot
   ending and never points at whoever claims that number next. */
export const skey = (s: { no: number; start: number; id?: string }) => s.id ?? s.no + ":" + Math.round(s.start);

/** A save with the small snapshot kept alongside it (§11). */
export type SaveEntry = {
  k: string;
  no: number;
  /** the lane number on the live wall */
  num?: number;
  name: string;
  lane: LaneId;
  start: number;
  link: Link | null;
  logo: string | null;
  seed?: number;
  pal?: Palette;
  img?: string | null;
  savedAt: number;
  /** "You were #7": how many had saved it, you included, when you did (live wall) */
  rank?: number;
  /** its save count the last time the wall showed it */
  count?: number;
};

export type OrderedSave = SaveEntry & { liveNow: boolean; cur: Spot | undefined };

/** Live saves leaving first (least time left), then the ended ones. */
export function savesOrder(saves: SaveEntry[], wall: Spot[]): OrderedSave[] {
  const byKey = new Map<string, Spot>();
  for (const s of wall) if (!s.vacant) byKey.set(skey(s), s);
  const now = saves.map((x) => {
    const cur = byKey.get(x.k);
    const liveNow = !!cur && !cur.vacant && left(cur) > 0;
    return { ...x, liveNow, cur };
  });
  return now
    .filter((x) => x.liveNow)
    .sort((a, b) => left(a.cur as { start: number }) - left(b.cur as { start: number }))
    .concat(now.filter((x) => !x.liveNow));
}

/** Craft pass: your finds as a history, the latest find first, ended ones included. */
export function foundOrder(saves: SaveEntry[], wall: Spot[]): OrderedSave[] {
  /* new finds go to the front of the list, which breaks ties */
  const at = new Map(saves.map((x, i) => [x.k, i] as const));
  return savesOrder(saves, wall).sort((a, b) => b.savedAt - a.savedAt || at.get(a.k)! - at.get(b.k)!);
}
