import assert from "node:assert/strict";
import { test } from "node:test";

/* pnpm test:unit */
const { provenance, personalItem, inHoldout, callsToday, callable, ordinal, readCalls, calledLabel } = await import("./retention.ts");
const H = 3600e3;
const now = Date.now();
const spot = (no, hoursAgo, extra = {}) => ({ no, lane: "music", name: "S" + no, start: now - hoursAgo * H, seed: 1, pal: [], links: [], id: "id-" + no, saves: 10, ...extra });
const find = (s, extra = {}) => ({ k: s.id, no: s.no, name: s.name, lane: s.lane, start: s.start, link: null, logo: null, savedAt: now - H, liveNow: true, cur: s, ...extra });
const status = (id, extra = {}) => ({ id, savedAt: null, rank: 1, savers: 1, saves: 1, hotAt: null, endsAt: null, gone: false, early: false, call: null, back: null, ...extra });
const iso = (t) => new Date(t).toISOString();

test("Finds: the most meaningful line wins, with real numbers only", () => {
  const s = spot(1, 10);
  const hotCall = { calledAt: iso(now - 20 * H), outcome: "hotspot", outcomeAt: iso(now - 6 * H), savesThen: 3 };
  assert.equal(provenance(find(s), status(s.id, { call: hotCall, early: true })).text, "Called · 14h early");
  /* which caller you were */
  const third = provenance(find(s), status(s.id, { call: { ...hotCall, rank: 3 } }));
  assert.equal(third.text, "Called 3rd · 14h early");
  assert.match(third.title, /You were the 3rd to call it\./);
  assert.equal(provenance(find(s), status(s.id, { saves: 380, call: { ...hotCall, outcome: "moved" } })).text, "Called at 3 · now 380");
  assert.equal(provenance(find(s), status(s.id, { saves: 380, call: { ...hotCall, outcome: "moved", rank: 1 } })).text, "Called 1st at 3 · now 380");
  assert.equal(provenance(find(s), status(s.id, { early: true, rank: 23, savers: 400, saves: 1284 })).text, "Found at 23 · now 1,284");
  assert.match(provenance(find(s), status(s.id, { early: true, rank: 23, savers: 400, saves: 1284 })).title, /first 10% of the people/);
  /* small stories: no percentage */
  assert.doesNotMatch(provenance(find(s), status(s.id, { early: true, rank: 2, savers: 9, saves: 9 })).title, /%/);
  /* an open call; a call that didn't come true on an ended story says nothing about it */
  assert.match(provenance(find(s), status(s.id, { call: { ...hotCall, outcome: null, outcomeAt: null } })).text, /^Called /);
  assert.match(provenance(find(s, { liveNow: false, cur: undefined }), status(s.id, { call: { ...hotCall, outcome: null, outcomeAt: null } })).text, /^Found /);
  assert.equal(provenance(find(s, { rank: 7 }), undefined).text, "#7 of 10");
  assert.equal(provenance(find(s), undefined), null);
});

test("since your last visit: one personal item, most important first", () => {
  const ending = spot(1, 70); // 2h left
  const moving = spot(2, 10, { saves: 30 });
  const back = spot(3, 1);
  const wall = [ending, moving, back];
  const since = now - 5 * H;
  const prior = new Map([[moving.id, 10]]);
  const base = { prior, since, wall };
  const saves = [find(ending), find(moving)];
  const call = { calledAt: iso(now - 20 * H), outcome: "hotspot", outcomeAt: iso(now - H), savesThen: 1 };
  assert.deepEqual(personalItem({ ...base, saves, finds: { [moving.id]: status(moving.id, { call }) } }), {
    kind: "called", text: "Something you called became a Hotspot", no: 2, story: moving.id,
  });
  /* a Hotspot from before the last visit is old news */
  assert.equal(personalItem({ ...base, saves, finds: { [moving.id]: status(moving.id, { call: { ...call, outcomeAt: iso(now - 6 * H) } }) } }).kind, "ending");
  assert.equal(personalItem({ ...base, saves, finds: {} }).text, "1 of your Finds ends in 2h");
  assert.equal(personalItem({ ...base, saves: [find(moving)], finds: {} }).text, "1 of your Finds is moving");
  /* +3 on 10 isn't moving */
  assert.equal(personalItem({ ...base, prior: new Map([[moving.id, 27]]), saves: [find(moving)], finds: {} }), null);
  const gone = find(spot(9, 80), { liveNow: false, cur: undefined, k: "old" });
  assert.equal(personalItem({ ...base, saves: [gone], finds: { old: status("old", { back: { id: back.id, lane: "music", no: 3, slug: "x", name: "S3" } }) } }).text, "A maker you found is back");
});

test("the control group is a fixed 10%", () => {
  const ids = Array.from({ length: 5000 }, (_, i) => "visitor-" + i);
  const share = ids.filter(inHoldout).length / ids.length;
  assert.ok(share > 0.08 && share < 0.12, String(share));
  assert.equal(inHoldout("visitor-7"), inHoldout("visitor-7"));
});

test("Call it: three a day, not on Hotspots or your own spot", () => {
  const day = Date.UTC(2026, 8, 24, 12);
  assert.equal(callsToday({ a: { at: day - H }, b: { at: day - 30 * H }, c: { at: day, rank: 2 } }, day), 2);
  /* stored calls from before ranks were kept still read */
  assert.deepEqual(readCalls({ a: day, b: { at: day, rank: 4 }, c: "x" }), { a: { at: day }, b: { at: day, rank: 4 } });
  assert.equal(calledLabel({ at: day, rank: 2 }), "Called 2nd · Sep 24");
  assert.equal(calledLabel({ at: day }), "Called · Sep 24");
  const s = spot(1, 10);
  assert.equal(callable(s, new Set()), true);
  assert.equal(callable(s, new Set([s.id])), false);
  assert.equal(callable({ ...s, mine: true }, new Set()), false);
  assert.equal(callable(spot(2, 80), new Set()), false);
  assert.deepEqual([1, 2, 3, 11, 12, 13, 21, 22, 101].map(ordinal), ["1st", "2nd", "3rd", "11th", "12th", "13th", "21st", "22nd", "101st"]);
});
