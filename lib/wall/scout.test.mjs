import assert from "node:assert/strict";
import { test } from "node:test";

/* pnpm test:unit */
const { SCOUT, breakoutOf, isEarly, callValue, scoutScore, tierFor, percentileFor, tierUp, statusLine, callLine } = await import("./scout.ts");

const H = 3600e3;
const base = { wasHot: false, position: 3, calledAt: 0, hotAt: null, endsAt: 72 * H };

test("a breakout is a Hotspot after the call, or real growth past you", () => {
  assert.equal(breakoutOf({ ...base, hotAt: 5 * H }, 4), "hotspot");
  assert.equal(breakoutOf({ ...base, wasHot: true, hotAt: 5 * H }, 4), null, "already a Hotspot when you kept it");
  assert.equal(breakoutOf({ ...base, calledAt: 6 * H, hotAt: 5 * H }, 4), null, "a Hotspot before you");
  assert.equal(breakoutOf(base, SCOUT.breakMin - 1), null);
  assert.equal(breakoutOf({ ...base, position: 10 }, 29), null, "25 keepers but not 3x your position");
  assert.equal(breakoutOf({ ...base, position: 10 }, 30), "grew");
});

test("an Early Call needs a breakout, a place in the first 20%, and no Hotspot yet", () => {
  assert.equal(isEarly({ wasHot: false, breakout: "grew", position: 5 }, 25), true);
  assert.equal(isEarly({ wasHot: false, breakout: "grew", position: 6 }, 25), false);
  assert.equal(isEarly({ wasHot: false, breakout: null, position: 1 }, 25), false);
  assert.equal(isEarly({ wasHot: true, breakout: "hotspot", position: 1 }, 25), false);
});

test("a call's value: earlier and bigger is worth more, a Hotspot 1.5x, capped growth, 0 unless early", () => {
  const c = { early: true, position: 1, keepersThen: 0, finalKeepers: 63, breakout: "grew" };
  assert.equal(callValue(c), 6);
  assert.equal(callValue({ ...c, breakout: "hotspot" }), 9);
  assert.equal(callValue({ ...c, finalKeepers: 1e6 }), 6, "growth is capped");
  assert.ok(callValue({ ...c, position: 12, keepersThen: 11 }) < callValue(c));
  assert.equal(callValue({ ...c, early: false }), 0);
  assert.equal(callValue({ ...c, finalKeepers: null }), 0);
});

test("reputation rewards a real early call over keeping everything", () => {
  const hit = { scored: true, settled: true, early: true, position: 2, keepersThen: 1, finalKeepers: 80, breakout: "hotspot" };
  const miss = { scored: true, settled: true, early: false, position: 50, keepersThen: 49, finalKeepers: 60, breakout: null };
  const careful = scoutScore([hit, miss, miss]);
  const farmer = scoutScore([hit, ...Array(200).fill(miss)]);
  assert.ok(careful > farmer * 10);
  assert.equal(scoutScore([{ ...hit, scored: false }]), 0, "calls that don't count, don't count");
  assert.equal(scoutScore([{ ...hit, settled: false }]), 0, "open calls aren't judged yet");
});

test("tiers: only with 200 eligible Scouts and an Early Call; top 3 / 10 / 25%", () => {
  assert.equal(tierFor(0, 199, 5), null, "below the population nobody gets a tier");
  assert.equal(tierFor(0, 3, 5), null, "3 Scouts don't make a Gold one");
  assert.equal(tierFor(0, 200, 0), null, "no Early Call, no tier");
  assert.equal(tierFor(5, 200, 1), "gold", "6th of 200: floor(3%) = 6");
  assert.equal(tierFor(6, 200, 1), "silver");
  assert.equal(tierFor(19, 200, 1), "silver");
  assert.equal(tierFor(20, 200, 1), "bronze");
  assert.equal(tierFor(49, 200, 1), "bronze");
  assert.equal(tierFor(50, 200, 1), null);
  /* ties share the better place: two Scouts with nobody above both have higher = 0 */
  assert.equal(tierFor(0, 1000, 1), "gold");
});

test("percentile rounds up, never flattering", () => {
  assert.equal(percentileFor(0, 200), 1);
  assert.equal(percentileFor(15, 200), 8);
  assert.equal(percentileFor(16, 200), 9);
  assert.ok(tierUp(null, "bronze") && tierUp("bronze", "silver") && !tierUp("gold", "silver") && !tierUp("silver", null));
});

test("the card's status line says only what is real", () => {
  assert.deepEqual(statusLine({ status: "building", percentile: null, settled: 3, minSettled: 10 }), { head: "Building your Scout history", sub: "Your standing shows once 10 of your Scouts have had their 72 hours · 3 so far" });
  assert.deepEqual(statusLine({ status: "scout", percentile: null, settled: 12, minSettled: 10 }), { head: "Scout", sub: null });
  assert.deepEqual(statusLine({ status: "silver", percentile: 8, settled: 40, minSettled: 10 }), { head: "Top 8%", sub: "Silver Scout" });
});

test("a Scout's line in the list comes from its call", () => {
  const c = { position: 12, keepersThen: 11, keepersNow: 340, source: "signed_in", settled: false, early: null, breakout: null, finalKeepers: null };
  assert.equal(callLine(c).text, "#12 · now 340");
  assert.equal(callLine({ ...c, breakout: "hotspot" }).text, "#12 · now a Hotspot");
  assert.equal(callLine({ ...c, settled: true, early: true, breakout: "grew", finalKeepers: 400 }).text, "Early Call · #12");
  assert.equal(callLine({ ...c, settled: true, early: true, breakout: "hotspot", finalKeepers: 400 }).text, "Early Call · Hotspot");
  assert.equal(callLine({ ...c, settled: true, early: false }).text, "Scouted #12");
  assert.match(callLine({ ...c, source: "migrated" }).title, /before you signed in/);
});
