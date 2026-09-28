/*
 * What the wall shows, in which order (BUILD_BRIEF §5, §6, §9): the lane
 * filter, the search, the circle starting at this visitor's entry point, and
 * rows of `cols` tiles. Ported from renderRack/entryFor in reference.html.
 */
import { LANE, numOf, type NavId, type Spot } from "./model";

export type RackItem =
  /* `big`: the spot shown two by two (craft pass); such a row spans two lines of `cols` */
  | { kind: "row"; spots: Spot[]; fillers: number; big?: number; cols?: number }
  | { kind: "wrap"; no: number }
  /* `no` and `entryNo` here are the numbers shown, not places on the wall */
  | { kind: "end"; entryNo: number };

/** `runs`: open spots next to each other shown as one, by the first one's `no` (craft pass). */
export type Rack = { entryNo: number; query: string; empty: boolean; items: RackItem[]; runs: Record<number, Spot[]> };

/* at least this many ordinary lines between two big spots, so they punctuate the wall */
export const BIG_GAP = 3;

/** The visitor's entry spot: always a filled one, walking forward round the circle. */
export function entryFor(wall: Spot[], list: Spot[], entryR: number) {
  const filled = wall.filter((s) => !s.vacant);
  if (!filled.length || !list.length) return list[0]?.no || 1;
  const base = filled[Math.floor(entryR * filled.length)].no;
  const cands = list.filter((s) => !s.vacant);
  if (!cands.length) return list[0].no;
  return (cands.find((s) => s.no >= base) || cands[0]).no;
}

export function buildRack(opts: { wall: Spot[]; lane: NavId; query: string; cols: number; entryR: number; big?: ReadonlySet<number> }): Rack {
  const { wall, lane, query, cols: C, entryR } = opts;
  const big = query ? new Set<number>() : (opts.big ?? new Set<number>());
  const hit = (s: Spot) =>
    !query || (!s.vacant && (s.name + " " + LANE[s.lane] + " " + (s.snippet || "")).toLowerCase().includes(query));
  const list = wall
    .filter((s) => (lane === "all" ? true : !s.vacant && s.lane === lane) && hit(s))
    .filter((s) => !(query && s.vacant));

  const entryNo = entryFor(wall, list, entryR);
  let at = list.findIndex((s) => s.no === entryNo);
  if (at < 0) at = 0;
  const ring = list.slice(at).concat(list.slice(0, at));

  /*
   * Craft pass: open spots next to each other on the whole wall (same lane on
   * the live wall) become one quiet slot, "No. 139–140". The first one stands
   * for the run; the order of the circle is unchanged.
   */
  const runs: Record<number, Spot[]> = {};
  const merge = (seg: Spot[]) => {
    const out: Spot[] = [];
    for (const s of seg) {
      const prev = out[out.length - 1];
      const run = prev && prev.vacant && s.vacant ? runs[prev.no] : null;
      if (prev && prev.vacant && s.vacant && (prev.lane ?? null) === (s.lane ?? null)) {
        if (run) run.push(s);
        else runs[prev.no] = [prev, s];
        continue;
      }
      out.push(s);
    }
    return out;
  };

  const items: RackItem[] = [];
  let quiet = BIG_GAP;
  const rows = (all: Spot[]) => {
    const seg = merge(all);
    for (let k = 0; k < seg.length; ) {
      /*
       * A big spot takes two by two places and needs room for them on the
       * line it starts in; its line and the next make one row of 2C - 3
       * spots. Without room, or too close to the last one, it stays small.
       */
      let j = -1;
      if (C >= 2 && quiet >= BIG_GAP)
        for (let i = k; i <= Math.min(k + C - 2, seg.length - 1); i++)
          if (!seg[i].vacant && big.has(seg[i].no)) {
            j = i;
            break;
          }
      if (j >= 0) {
        const part = seg.slice(k, k + 2 * C - 3);
        items.push({ kind: "row", spots: part, fillers: 2 * C - 3 - part.length, big: seg[j].no, cols: C });
        k += part.length;
        quiet = 0;
        continue;
      }
      const part = seg.slice(k, k + C);
      items.push({ kind: "row", spots: part, fillers: C - part.length });
      k += part.length;
      quiet++;
    }
  };
  const w = query ? -1 : ring.findIndex((s, i) => i > 0 && s.no < ring[i - 1].no);
  if (w > 0) {
    rows(ring.slice(0, w));
    items.push({ kind: "wrap", no: numOf(ring[w]) });
    rows(ring.slice(w));
  } else rows(ring);
  if (ring.length && !query) items.push({ kind: "end", entryNo: numOf(ring[0]) });

  return { entryNo, query, empty: !list.length, items, runs };
}
