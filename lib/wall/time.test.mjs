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
