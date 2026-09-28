import assert from "node:assert/strict";
import { test } from "node:test";

/* pnpm test:unit */
const { buildRack, BIG_GAP } = await import("./rack.ts");
const filled = (no) => ({ no, lane: "music", name: "S" + no, snippet: "", start: Date.now(), seed: no, pal: [], links: [], opens: 0, saves: 0 });
const vacant = (no) => ({ no, vacant: true });
const wall = (n, isVacant = () => false) => Array.from({ length: n }, (_, i) => (isVacant(i + 1) ? vacant(i + 1) : filled(i + 1)));
const rows = (r) => r.items.filter((x) => x.kind === "row");
const order = (r) => rows(r).flatMap((x) => x.spots.map((s) => s.no));

test("a big spot makes a two-line row of 2C - 3 spots, in the circle's order", () => {
  const r = buildRack({ wall: wall(40), lane: "all", query: "", cols: 5, entryR: 0, big: new Set([7]) });
  const row = rows(r).find((x) => x.big);
  assert.equal(row.big, 7);
  assert.equal(row.cols, 5);
  assert.equal(row.spots.length + row.fillers, 7);
  assert.deepEqual(order(r), Array.from({ length: 40 }, (_, i) => i + 1));
});

test("a big spot needs room on its line and stays small near the last one", () => {
  /* 5 columns: it can start at most three places into a line */
  const late = buildRack({ wall: wall(10), lane: "all", query: "", cols: 5, entryR: 0, big: new Set([5]) });
  assert.equal(rows(late)[0].big, undefined);
  const close = buildRack({ wall: wall(60), lane: "all", query: "", cols: 5, entryR: 0, big: new Set([1, 9]) });
  assert.deepEqual(rows(close).filter((x) => x.big).map((x) => x.big), [1]);
  const apart = buildRack({ wall: wall(80), lane: "all", query: "", cols: 5, entryR: 0, big: new Set([1, 8 + 5 * BIG_GAP]) });
  assert.equal(rows(apart).filter((x) => x.big).length, 2);
});

test("on two columns a big spot has the row to itself", () => {
  const r = buildRack({ wall: wall(12), lane: "all", query: "", cols: 2, entryR: 0, big: new Set([3]) });
  const row = rows(r).find((x) => x.big);
  assert.deepEqual(row.spots.map((s) => s.no), [3]);
  assert.equal(row.fillers, 0);
});

test("a search shows no big spots", () => {
  const r = buildRack({ wall: wall(20), lane: "all", query: "s1", cols: 5, entryR: 0, big: new Set([1, 10]) });
  assert.equal(rows(r).filter((x) => x.big).length, 0);
});

test("open spots side by side are one slot, standing for all of them", () => {
  const r = buildRack({ wall: wall(10, (n) => n >= 4 && n <= 6), lane: "all", query: "", cols: 5, entryR: 0 });
  assert.deepEqual(order(r), [1, 2, 3, 4, 7, 8, 9, 10]);
  assert.deepEqual(r.runs[4].map((s) => s.no), [4, 5, 6]);
  const single = buildRack({ wall: wall(10, (n) => n === 4), lane: "all", query: "", cols: 5, entryR: 0 });
  assert.equal(single.runs[4], undefined);
});

test("open spots in different lanes stay apart", () => {
  const w = wall(6, (n) => n === 3 || n === 4).map((s) => (s.vacant ? { ...s, lane: s.no === 3 ? "music" : "games" } : s));
  const r = buildRack({ wall: w, lane: "all", query: "", cols: 5, entryR: 0 });
  assert.deepEqual(order(r), [1, 2, 3, 4, 5, 6]);
});

test("open spots merge only when their numbers follow on", () => {
  /* the live wall: neighbours in one lane can be Nos. 5 and 300 */
  const w = [filled(1), { no: 2, num: 5, vacant: true, lane: "music" }, { no: 3, num: 300, vacant: true, lane: "music" }, { no: 4, num: 301, vacant: true, lane: "music" }, filled(5)];
  const r = buildRack({ wall: w, lane: "all", query: "", cols: 5, entryR: 0 });
  assert.deepEqual(order(r), [1, 2, 3, 5]);
  assert.equal(r.runs[2], undefined);
  assert.deepEqual(r.runs[3].map((s) => s.num), [300, 301]);
});
