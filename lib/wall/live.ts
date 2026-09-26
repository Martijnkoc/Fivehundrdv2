/*
 * The live wall (BUILD_BRIEF §0): 500 spots per lane, and a Wall tab of at
 * most 500 tiles — every live story first, taking turns lane by lane, then
 * open spots, also taking turns, until the wall holds 500.
 *
 * Each spot gets a place on this visitor's wall (`no`, 1…n, the order the
 * wall walks round) and keeps its own lane and number (`lane`, `num`).
 */
import { PAL } from "./demo";
import { LANES, type FilledSpot, type LaneId, type Spot, type VacantSpot } from "./model";

export const WALL_SIZE = 500;
export const PER_LANE = 500;

/** One live story as /api/wall returns it (wall_public() in the database). */
export type FeedStory = {
  id: string;
  lane: LaneId;
  no: number;
  name: string;
  snippet: string | null;
  artwork: string | null;
  logo: string | null;
  audio: string | null;
  audioEmbed: string | null;
  excerptTitle: string | null;
  excerpt: string | null;
  trailerUrl: string | null;
  trailerLen: string | null;
  links: { label: string; url: string }[];
  seed: number;
  pal: number;
  startsAt: string;
  endsAt: string;
  opens: number;
  saves: number;
};
export type Feed = { now: string; stories: FeedStory[]; held: [LaneId, number][] };

const LANE_ORDER = LANES.map(([k]) => k);

/** Round-robin over per-lane queues, in the lanes' order. */
function takeTurns<T>(queues: T[][], limit = Infinity): T[] {
  const out: T[] = [];
  const at = queues.map(() => 0);
  let left = queues.reduce((n, q) => n + q.length, 0);
  while (left > 0 && out.length < limit)
    for (let i = 0; i < queues.length && out.length < limit; i++)
      if (at[i] < queues[i].length) {
        out.push(queues[i][at[i]++]);
        left--;
      }
  return out;
}

/** A public URL for a stored media path ("bucket/…" is not stored; paths are per bucket). */
export const mediaURL = (base: string, bucket: "art" | "audio", path: string | null) =>
  path ? `${base}/storage/v1/object/public/${bucket}/${path}` : null;

export function toSpot(s: FeedStory, no: number, base: string, mine: ReadonlySet<string>): FilledSpot {
  return {
    no,
    num: s.no,
    id: s.id,
    lane: s.lane,
    name: s.name,
    snippet: s.snippet || "",
    start: Date.parse(s.startsAt),
    seed: s.seed,
    pal: PAL[s.pal] ?? PAL[0],
    links: s.links,
    opens: s.opens,
    saves: s.saves,
    mine: mine.has(s.id) || undefined,
    img: mediaURL(base, "art", s.artwork),
    logo: mediaURL(base, "art", s.logo),
    audio: mediaURL(base, "audio", s.audio),
    excerpt: s.excerpt ? { t: s.excerptTitle || "", x: s.excerpt } : null,
    trailer: s.trailerUrl ? { url: s.trailerUrl, len: s.trailerLen || "" } : null,
  };
}

/** The visitor's live wall: every live story, then open spots up to WALL_SIZE. */
export function buildLiveWall(feed: Feed, base: string, mine: ReadonlySet<string> = new Set()): Spot[] {
  const byLane = new Map<LaneId, FeedStory[]>(LANE_ORDER.map((k) => [k, []]));
  for (const s of feed.stories) byLane.get(s.lane)?.push(s);
  for (const q of byLane.values()) q.sort((a, b) => a.no - b.no);
  const live = takeTurns(LANE_ORDER.map((k) => byLane.get(k)!));

  const taken = new Set([...feed.stories.map((s) => `${s.lane}:${s.no}`), ...feed.held.map(([l, n]) => `${l}:${n}`)]);
  const open = LANE_ORDER.map((lane) => {
    const q: { lane: LaneId; num: number }[] = [];
    for (let n = 1; n <= PER_LANE; n++) if (!taken.has(`${lane}:${n}`)) q.push({ lane, num: n });
    return q;
  });
  const vacant = takeTurns(open, Math.max(0, WALL_SIZE - live.length));

  const wall: Spot[] = live.map((s, i) => toSpot(s, i + 1, base, mine));
  vacant.forEach((v, i) => wall.push({ no: live.length + i + 1, vacant: true, lane: v.lane, num: v.num } satisfies VacantSpot));
  return wall;
}

/** Open numbers in a lane, as far as this visitor's wall knows. */
export function openNumbers(feed: Feed, lane: LaneId): number[] {
  const taken = new Set([
    ...feed.stories.filter((s) => s.lane === lane).map((s) => s.no),
    ...feed.held.filter(([l]) => l === lane).map(([, n]) => n),
  ]);
  const out: number[] = [];
  for (let n = 1; n <= PER_LANE; n++) if (!taken.has(n)) out.push(n);
  return out;
}

/**
 * Brings a wall the visitor is looking at up to date without reshuffling it:
 * stories that left become open spots where they were, new stories take an
 * open spot (their own number if it is on the wall, else the first open one,
 * else a new place at the end), and counters follow the feed.
 * Returns true when the wall's layout changed.
 */
export function mergeFeed(wall: Spot[], feed: Feed, base: string, mine: ReadonlySet<string> = new Set()): boolean {
  const byId = new Map(feed.stories.map((s) => [s.id, s]));
  const onWall = new Set<string>();
  let changed = false;
  wall.forEach((s, i) => {
    if (s.vacant) return;
    const f = s.id ? byId.get(s.id) : undefined;
    if (!f) {
      wall[i] = { no: s.no, vacant: true, lane: s.lane, num: s.num };
      changed = true;
      return;
    }
    onWall.add(f.id);
    s.opens = Math.max(s.opens, f.opens);
    s.saves = f.saves;
    if (mine.has(f.id)) s.mine = true;
  });
  const fresh = feed.stories.filter((s) => !onWall.has(s.id)).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  for (const f of fresh) {
    let i = wall.findIndex((s) => s.vacant && s.lane === f.lane && s.num === f.no);
    if (i < 0) i = wall.findIndex((s) => s.vacant);
    if (i < 0) i = wall.push({ no: wall.length + 1, vacant: true }) - 1;
    wall[i] = toSpot(f, wall[i].no, base, mine);
    changed = true;
  }
  return changed;
}
