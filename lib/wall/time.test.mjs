import assert from "node:assert/strict";
import { test } from "node:test";

/* pnpm test:unit */
const { clock, phase } = await import("./time.ts");
const H = 3600e3;
const started = (hoursAgo) => ({ start: Date.now() - hoursAgo * H });

test("a story rises for three hours, is live, then has its last six", () => {
  assert.equal(phase(started(0)), "rising");
  assert.equal(phase(started(2.9)), "rising");
  assert.equal(phase(started(3.1)), "live");
  assert.equal(phase(started(65.9)), "live");
  assert.equal(phase(started(66.1)), "last");
  assert.equal(phase(started(71.99)), "last");
});

test("the final hours read to the minute", () => {
  assert.equal(clock(4 * H + 7 * 60e3), "4h 07m");
  assert.equal(clock(59 * 60e3), "59m");
  assert.equal(clock(10e3), "1m");
});

test("kept on for 72 more hours: time left runs to the new end, age from when it went live", async () => {
  const { age, ends, left, phase } = await import("./time.ts");
  const now = Date.now();
  const s = { start: now - 70 * 3600e3, end: now + 74 * 3600e3 };
  assert.equal(ends(s), s.end);
  assert.ok(Math.abs(left(s) - 74 * 3600e3) < 1000);
  assert.ok(Math.abs(age(s) - 70 * 3600e3) < 1000);
  assert.equal(phase(s), "live");
  /* without an end of its own, a spot ends 72 hours after it went live */
  assert.equal(ends({ start: now }), now + 72 * 3600e3);
});

test("coming up: the day counts down in the visitor's days, and a passed day isn't shown", async () => {
  const { comingUp } = await import("./time.ts");
  const at = (d) => new Date(2026, 9, d, 15, 0).getTime();
  assert.equal(comingUp(undefined), null);
  assert.deepEqual(comingUp({ t: "Album out" }, at(5)), { t: "Album out", when: "" });
  assert.equal(comingUp({ t: "Album out", on: "2026-10-05" }, at(5)).when, "Today");
  assert.equal(comingUp({ t: "Album out", on: "2026-10-06" }, at(5)).when, "Tomorrow");
  assert.match(comingUp({ t: "Album out", on: "2026-10-12" }, at(5)).when, /12 Oct · in 7 days$/);
  assert.equal(comingUp({ t: "Album out", on: "2026-10-04" }, at(5)), null);
});
