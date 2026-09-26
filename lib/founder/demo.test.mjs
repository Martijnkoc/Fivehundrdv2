import assert from "node:assert/strict";
import { test } from "node:test";

/* pnpm test:unit: the demo data answers like the database does, and stays consistent */
const { demo } = await import("./demo.ts");
const TZ = "Europe/Amsterdam";

test("demo: KPIs, series and filters agree", () => {
  const to = new Date().toISOString();
  const from = new Date(Date.now() - 7 * 864e5).toISOString();
  const k = demo.kpis(from, to, {}, TZ);
  assert.ok(k.visitors > 1000 && k.opens > 0 && k.paid > 0);
  assert.ok(k.newVisitors <= k.visitors && k.openers <= k.opens && k.savers <= k.saves);
  const s = demo.series(from, to, "day", {}, TZ);
  assert.equal(s.reduce((a, p) => a + p.opens, 0), k.opens);
  assert.equal(s.reduce((a, p) => a + p.gross, 0), k.gross);
  const music = demo.kpis(from, to, { lane: "music" }, TZ);
  assert.ok(music.opens < k.opens && music.opens > 0);
  const mobile = demo.kpis(from, to, { device: "mobile" }, TZ);
  assert.ok(mobile.visitors < k.visitors && mobile.visitors > k.visitors * 0.4);
  const lanes = demo.lanes(from, to, {}, TZ);
  assert.equal(lanes.reduce((a, l) => a + l.opens, 0), k.opens);
});

test("demo: the feed is anonymous and nothing comes from the future", () => {
  const items = demo.feed(new Date(Date.now() - 3600e3).toISOString(), 100, TZ);
  assert.ok(items.length > 0);
  for (const i of items) {
    assert.ok(!("visitor" in i));
    assert.ok(Date.parse(i.at) <= Date.now());
  }
});
