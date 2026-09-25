/*
 * What the wall shows, in which order (BUILD_BRIEF §5, §6, §9): the lane
 * filter, the search, the circle starting at this visitor's entry point, and
 * rows of `cols` tiles. Ported from renderRack/entryFor in reference.html.
 */
import { LANE, type NavId, type Spot } from "./model";

export type RackItem =
  | { kind: "row"; spots: Spot[]; fillers: number }
  | { kind: "wrap"; no: number }
  | { kind: "end"; entryNo: number };

export type Rack = { entryNo: number; query: string; empty: boolean; items: RackItem[] };

/** The visitor's entry spot: always a filled one, walking forward round the circle. */
export function entryFor(wall: Spot[], list: Spot[], entryR: number) {
  const filled = wall.filter((s) => !s.vacant);
  if (!filled.length || !list.length) return list[0]?.no || 1;
  const base = filled[Math.floor(entryR * filled.length)].no;
  const cands = list.filter((s) => !s.vacant);
  if (!cands.length) return list[0].no;
  return (cands.find((s) => s.no >= base) || cands[0]).no;
}

export function buildRack(opts: { wall: Spot[]; lane: NavId; query: string; cols: number; entryR: number }): Rack {
  const { wall, lane, query, cols: C, entryR } = opts;
  const hit = (s: Spot) =>
    !query || (!s.vacant && (s.name + " " + LANE[s.lane] + " " + (s.snippet || "")).toLowerCase().includes(query));
  const list = wall
    .filter((s) => (lane === "all" ? true : !s.vacant && s.lane === lane) && hit(s))
    .filter((s) => !(query && s.vacant));

  const entryNo = entryFor(wall, list, entryR);
  let at = list.findIndex((s) => s.no === entryNo);
  if (at < 0) at = 0;
  const ring = list.slice(at).concat(list.slice(0, at));

  const items: RackItem[] = [];
  const rows = (seg: Spot[]) => {
    for (let k = 0; k < seg.length; k += C) {
      const part = seg.slice(k, k + C);
      items.push({ kind: "row", spots: part, fillers: C - part.length });
    }
  };
  const w = query ? -1 : ring.findIndex((s, i) => i > 0 && s.no < ring[i - 1].no);
  if (w > 0) {
    rows(ring.slice(0, w));
    items.push({ kind: "wrap", no: ring[w].no });
    rows(ring.slice(w));
  } else rows(ring);
  if (ring.length && !query) items.push({ kind: "end", entryNo });

  return { entryNo, query, empty: !list.length, items };
}
