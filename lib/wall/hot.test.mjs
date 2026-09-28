import assert from "node:assert/strict";
import { test } from "node:test";

/* pnpm test:unit */
const { hotspots, newest, sinceLastVisit, VISIT_GAP } = await import("./hot.ts");
const H = 3600e3;
const now = Date.now();
const spot = (no, lane, hoursAgo, extra = {}) => ({ no, lane, name: "S" + no, start: now - hoursAgo * H, seed: 1, pal: [], links: [], id: "id-" + no, ...extra });

test("hotspots follow the database's order, per lane, live only", () => {
  const wall = [spot(1, "music", 1), spot(2, "games", 2), spot(3, "music", 80), { no: 4, vacant: true }];
  const hot = [
    { id: "id-2", rank: 1, opens: 5, clicks: 0, saves: 3 },
    { id: "id-3", rank: 2, opens: 9, clicks: 0, saves: 0 },
    { id: "id-1", rank: 3, opens: 4, clicks: 2, saves: 0 },
  ];
  assert.deepEqual(hotspots(wall, hot, "all").map((p) => p.s.no), [2, 1]);
  assert.deepEqual(hotspots(wall, hot, "music").map((p) => p.s.no), [1]);
  assert.equal(hotspots(wall, hot, "all")[0].why, "3 saves lately");
  assert.equal(hotspots(wall, hot, "all")[1].why, "2 visits to the maker");
});

test("newest first; the demo wall ranks by its own counters", () => {
  const wall = [spot(1, "music", 5, { saves: 1 }), spot(2, "art", 0.2, { opens: 1 }), spot(3, "music", 30, { saves: 3 })];
  assert.deepEqual(newest(wall, "all").map((p) => p.s.no), [2, 1, 3]);
  assert.match(newest(wall, "all")[0].why, /joined 12 min ago/);
  assert.equal(hotspots(wall, null, "all")[0].s.no, 2);
});

test("since your last visit: counted on a new visit, not on every reload", () => {
  const a = spot(1, "music", 10), b = spot(2, "music", 5), c = spot(3, "music", 0.5);
  let r = sinceLastVisit(null, [a, b], now - 2 * H);
  assert.equal(r.since, null);
  /* a reload 5 minutes later: same visit */
  r = sinceLastVisit(r.mem, [a, b], now - 2 * H + 5 * 60e3);
  assert.equal(r.since, null);
  /* back after two hours: c is new, a has gone */
  r = sinceLastVisit(r.mem, [b, c], now);
  assert.deepEqual({ fresh: r.since.fresh, gone: r.since.gone }, { fresh: 1, gone: 1 });
  /* reloading keeps the same comparison */
  r = sinceLastVisit(r.mem, [b, c], now + 60e3);
  assert.equal(r.since.fresh, 1);
  assert.ok(VISIT_GAP === 30 * 60e3);
});
