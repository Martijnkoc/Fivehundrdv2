import { LIFE, type FilledSpot, type NavId, type Spot } from "./model";
import { left } from "./time";

/*
 * Above the wall: Hotspots (traction right now) and Newest. On the live wall
 * the ranking comes from the database (hot_public(), every 10 minutes: opens,
 * click-throughs and saves in the last 6 hours, per person and per exposure,
 * and the spotlight moves on after a while). The demo wall has no history, so
 * it ranks by its own counters.
 */

export type HotEntry = { id: string; rank: number; opens: number; clicks: number; saves: number };
export type Pick = { s: FilledSpot; why: string };

const live = (s: Spot): s is FilledSpot => !s.vacant && left(s) > 0;
const inLane = (lane: NavId) => (s: FilledSpot) => lane === "all" || s.lane === lane;
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

export function hotspots(wall: Spot[], hot: HotEntry[] | null, lane: NavId, n = 5): Pick[] {
  const spots = wall.filter(live).filter(inLane(lane));
  if (hot) {
    const byId = new Map(spots.filter((s) => s.id).map((s) => [s.id!, s]));
    return hot
      .map((h) => ({ h, s: byId.get(h.id) }))
      .filter((x): x is { h: HotEntry; s: FilledSpot } => !!x.s)
      .slice(0, n)
      .map(({ h, s }) => ({
        s,
        why: h.saves ? `${plural(h.saves, "save")} lately` : h.clicks ? `${plural(h.clicks, "visit")} to the maker` : `${plural(h.opens, "open")} lately`,
      }));
  }
  /* the demo wall: its own counters, favouring saves, per hour on the wall */
  return spots
    .map((s) => ({ s, score: ((s.opens || 0) + 4 * (s.saves || 0)) / Math.max(1, (LIFE - left(s)) / 3600e3) }))
    .sort((a, b) => b.score - a.score || a.s.no - b.s.no)
    .slice(0, n)
    /* the tile already shows its counts */
    .map(({ s }) => ({ s, why: "" }));
}

export function newest(wall: Spot[], lane: NavId, n = 5): Pick[] {
  const ago = (s: FilledSpot) => {
    const m = Math.max(1, Math.round((LIFE - left(s)) / 60e3));
    return m < 60 ? `joined ${m} min ago` : m < 48 * 60 ? `joined ${Math.round(m / 60)} h ago` : `joined ${Math.round(m / 1440)} days ago`;
  };
  return wall
    .filter(live)
    .filter(inLane(lane))
    .sort((a, b) => b.start - a.start || a.no - b.no)
    .slice(0, n)
    .map((s) => ({ s, why: ago(s) }));
}

/* ---------- since your last visit ---------- */

/** What the visitor's browser remembers between visits (a new visit after 30 minutes away). */
export type VisitMemory = { active: number; cur: { at: number; ids: string[] }; prev: { at: number; ids: string[] } | null };
export const VISIT_GAP = 30 * 60e3;
const idOf = (s: FilledSpot) => (s.id ?? `${s.no}:${Math.round(s.start)}`).slice(0, 12);

/** Rolls the memory forward on a new visit, and says what changed since the previous one. */
export function sinceLastVisit(mem: VisitMemory | null, wall: Spot[], now: number): { mem: VisitMemory; since: { at: number; fresh: number; gone: number } | null } {
  const spots = wall.filter(live);
  const ids = spots.map(idOf);
  let m: VisitMemory;
  if (!mem) m = { active: now, cur: { at: now, ids }, prev: null };
  else if (now - mem.active > VISIT_GAP) m = { active: now, cur: { at: now, ids }, prev: mem.cur };
  else m = { ...mem, active: now };
  if (!m.prev) return { mem: m, since: null };
  const before = new Set(m.prev.ids);
  const nowIds = new Set(ids);
  const fresh = spots.filter((s) => !before.has(idOf(s)) && s.start > m.prev!.at - 60e3).length;
  const gone = m.prev.ids.filter((i) => !nowIds.has(i)).length;
  return { mem: m, since: { at: m.prev.at, fresh, gone } };
}
