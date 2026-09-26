import assert from "node:assert/strict";
import { test } from "node:test";

/* pnpm test:unit: the Control Room's pure logic */
const { parsePeriod, parseFilters, withParams, dayStart, dayOf } = await import("./filters.ts");
const { evaluate } = await import("./alerts.ts");
const { toCsv } = await import("./csv.ts");
const { sessionValue, readSession } = await import("./session.ts");
const { change, money, pct } = await import("./format.ts");
const { phraseText } = await import("./feedText.ts");

const TZ = "Europe/Amsterdam";
const NOW = Date.parse("2026-09-26T13:30:00Z"); /* 15:30 in Amsterdam */

test("periods start at local midnight and compare with the same stretch before", () => {
  const today = parsePeriod({}, NOW, TZ, "2026-09-01");
  assert.equal(today.range, "today");
  assert.equal(today.from, "2026-09-25T22:00:00.000Z");
  assert.equal(today.to, new Date(NOW).toISOString());
  assert.equal(today.prevFrom, "2026-09-24T22:00:00.000Z");
  assert.equal(today.prevTo, new Date(NOW - 864e5).toISOString());
  assert.equal(today.bucket, "hour");

  const week = parsePeriod({ range: "7d" }, NOW, TZ, "2026-09-01");
  assert.equal(week.fromDay, "2026-09-20");
  assert.equal(week.bucket, "day");
  assert.equal(Date.parse(week.from) - Date.parse(week.prevFrom), 7 * 864e5);

  const all = parsePeriod({ range: "all" }, NOW, TZ, "2026-09-01");
  assert.equal(all.fromDay, "2026-09-01");
  assert.equal(all.prevFrom, null);

  const custom = parsePeriod({ range: "custom", from: "2026-09-10", to: "2026-09-12" }, NOW, TZ, "2026-09-01");
  assert.equal(custom.from, "2026-09-09T22:00:00.000Z");
  assert.equal(custom.to, "2026-09-12T22:00:00.000Z");
  /* nonsense falls back to today */
  assert.equal(parsePeriod({ range: "custom", from: "x" }, NOW, TZ, "2026-09-01").range, "today");
  assert.equal(parsePeriod({ range: "5y" }, NOW, TZ, "2026-09-01").range, "today");
});

test("time zones: day starts across daylight saving", () => {
  assert.equal(new Date(dayStart("2026-10-25", TZ)).toISOString(), "2026-10-24T22:00:00.000Z");
  assert.equal(new Date(dayStart("2026-10-26", TZ)).toISOString(), "2026-10-25T23:00:00.000Z");
  assert.equal(dayOf(Date.parse("2026-09-25T22:30:00Z"), TZ), "2026-09-26");
});

test("filters only accept known values", () => {
  assert.deepEqual(parseFilters({ lane: "music", kind: "audio", visitor: "new", source: "instagram", device: "mobile", country: "NL" }), {
    lane: "music",
    kind: "audio",
    visitor: "new",
    source: "instagram",
    device: "mobile",
    country: "NL",
  });
  assert.deepEqual(parseFilters({ lane: "x'; drop", visitor: "all", source: "Insta Gram", country: "nl" }), {});
  assert.equal(withParams({ range: "custom", from: "2026-09-01", to: "2026-09-02", lane: "music" }, { range: "7d" }, "/founder/wall"), "/founder/wall?range=7d&lane=music");
});

const K = (o = {}) => ({
  visitors: 0, newVisitors: 0, visits: 0, fromShares: 0, impressions: 0, viewers: 0, opens: 0, openers: 0, saves: 0, savers: 0, unsaves: 0,
  shares: 0, sharers: 0, clicks: 0, entries: 0, createStarts: 0, checkouts: 0, paid: 0, creators: 0, newCreators: 0, gross: 0, refunds: 0,
  fees: 0, disputes: 0, liveSpots: 0, accounts: 0, reports: 0, cohort: 0, returned7: 0, ...o,
});
const OPS = (o = {}) => ({
  hours: [{ t: "", requests: 1000, errors: 1, slow: 0 }], routes: [], errors: [], webhooks: { ok24h: 10, failed24h: 0, last: null }, uploads: { failed24h: 0 },
  clientErrors24h: 0, cron: [], database: { bytes: 1, connections: 1 },
  ingestion: { lastVisit: new Date(NOW - 60e3).toISOString(), lastEvent: new Date(NOW - 60e3).toISOString(), lagMs: 200 }, ...o,
});

test("alerts stay quiet on normal days and on too little volume", () => {
  const quiet = evaluate({ day: K({ visits: 700, checkouts: 20, paid: 12, createStarts: 30 }), week: K({ visits: 7 * 680, checkouts: 140, paid: 84, createStarts: 210 }), ops: OPS(), lanes: [], spots: [], now: NOW });
  assert.deepEqual(quiet, []);
  /* 40% down, but on a baseline of 30 visits a day: noise */
  assert.deepEqual(evaluate({ day: K({ visits: 5 }), week: K({ visits: 210 }), ops: OPS(), lanes: [], spots: [], now: NOW }), []);
});

test("alerts fire on real problems", () => {
  const ids = evaluate({
    day: K({ visits: 200, checkouts: 20, paid: 2, fromShares: 90 }),
    week: K({ visits: 7 * 700, checkouts: 140, paid: 84, fromShares: 70 }),
    ops: OPS({ hours: [{ t: "", requests: 1000, errors: 50, slow: 0 }], webhooks: { ok24h: 5, failed24h: 2, last: null } }),
    lanes: [{ lane: "music", label: "Music", live: 470, opens: 0, saves: 0, shares: 0, impressions: 0, paid: 0, revenue: 0 }],
    spots: [],
    now: NOW,
  }).map((a) => a.id);
  for (const id of ["traffic-down", "checkout-down", "errors", "webhooks", "lane-music", "share-spike"]) assert.ok(ids.includes(id), id);
  assert.equal(ids[0] === "checkout-down" || ids[0] === "errors" || ids[0] === "webhooks", true, "critical first");
});

test("CSV quotes, keeps numbers, and defuses formulas", () => {
  const csv = toCsv({ cols: [{ key: "a", label: "Name" }, { key: "b", label: "Amount" }], rows: [{ a: 'Say "hi", ok', b: 9.95 }, { a: "=HYPERLINK(1)", b: -1 }, { a: null, b: 0 }] });
  assert.equal(csv, '﻿Name,Amount\r\n"Say ""hi"", ok",9.95\r\n"\'=HYPERLINK(1)",-1\r\n,0\r\n');
});

test("session cookies: signed, expiring, and only for listed addresses", () => {
  const v = sessionValue("me@fivehundrd.com", "secret", NOW);
  assert.equal(readSession(v, "secret", ["me@fivehundrd.com"], NOW), "me@fivehundrd.com");
  assert.equal(readSession(v, "other", ["me@fivehundrd.com"], NOW), null);
  assert.equal(readSession(v, "secret", ["someone@else.com"], NOW), null);
  assert.equal(readSession(v, "secret", ["me@fivehundrd.com"], NOW + 15 * 864e5), null);
  const [body, mac] = v.split(".");
  const forged = Buffer.from(JSON.stringify({ e: "me@fivehundrd.com", x: NOW * 2 })).toString("base64url");
  assert.equal(readSession(`${forged}.${mac}`, "secret", ["me@fivehundrd.com"], NOW), null);
  assert.equal(readSession(body, "secret", ["me@fivehundrd.com"], NOW), null);
});

test("numbers and live sentences read like people write them", () => {
  assert.equal(money(995), "$9.95");
  assert.equal(pct(0.384), "38%");
  assert.equal(change(110, 100).label, "+10%");
  assert.equal(change(0.3, 0.25, "rate").label, "+5.0 pts");
  const base = { source: null, device: null, country: null, isNew: null, lane: null, no: null, name: null, story: null, amount: null, step: null };
  assert.equal(phraseText({ ...base, at: "", kind: "open", source: "instagram", lane: "music", no: 281 }), "visitor from Instagram opened No. 281 Music");
  assert.equal(phraseText({ ...base, at: "", kind: "paid", amount: 995, lane: "games", no: 12 }), "checkout completed — $9.95 — No. 12 Games is live");
  assert.equal(phraseText({ ...base, at: "", kind: "create_start" }), "creator began Create");
});
