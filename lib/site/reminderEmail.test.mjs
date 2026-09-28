import assert from "node:assert/strict";
import { test } from "node:test";

/* pnpm test:unit */
const { reminderEmail, makerEmail, numbersLine } = await import("./reminderEmail.ts");
const now = Date.UTC(2026, 8, 27, 12);
const s = (name, mins, extra = {}) => ({ id: "id-" + name, name, lane: "music", no: 7, slug: "abcd1234", endsAt: new Date(now + mins * 60e3).toISOString(), ...extra });

test("one Find: its name and time in the subject, its lasting link, and the off link", () => {
  const m = reminderEmail([s("Lowtide <Club>", 60)], "https://fivehundrd.com", "https://fivehundrd.com/api/remind/off?u=x&t=y", now);
  assert.equal(m.subject, "Lowtide <Club> leaves The Wall in an hour");
  assert.match(m.text, /Lowtide <Club> \(Music, No\. 007\) ends in an hour\nhttps:\/\/fivehundrd\.com\/s\/music\/7\/abcd1234/);
  assert.match(m.text, /Turn them off: https:\/\/fivehundrd\.com\/api\/remind\/off\?u=x&t=y/);
  /* names are escaped in the html */
  assert.match(m.html, /Lowtide &lt;Club&gt;/);
  assert.doesNotMatch(m.html, /<Club>/);
});

test("several Scouts, soonest first as given, with minutes when it's under the hour", () => {
  const m = reminderEmail([s("A", 20), s("B", 65, { lane: "writers", no: 212 })], "https://x.test", "https://x.test/off", now);
  assert.equal(m.subject, "2 of your Scouts leave The Wall within the hour");
  assert.match(m.text, /A \(Music, No\. 007\) ends in 20 minutes/);
  assert.match(m.text, /B \(Books, No\. 212\) ends in an hour/);
});

test("makers: their own numbers in plain words, zeros left out", () => {
  assert.equal(numbersLine({ seen: 1204, opened: 312, kept: 48, clicked: 21, shared: 0 }), "1,204 saw it, 312 opened it, 48 keep it and 21 went to your links");
  assert.equal(numbersLine({ seen: 3, opened: 0, kept: 0, clicked: 0, shared: 0 }), "3 saw it");
  assert.equal(numbersLine({ seen: 0, opened: 0, kept: 0, clicked: 0, shared: 0 }), "");
});

test("makers: Hotspot and 6-hours-left emails with the lasting link and a stop link", () => {
  const n = { name: "Lowtide Club", lane: "music", no: 7, slug: "abcd1234", endsAt: new Date(now + 6 * 3600e3).toISOString(), stats: { seen: 40, opened: 12, kept: 5, clicked: 3, shared: 1 } };
  const hot = makerEmail({ ...n, kind: "hot" }, "https://x.test", "https://x.test/off", now);
  assert.equal(hot.subject, "Lowtide Club is a Hotspot on Fivehundrd");
  assert.match(hot.text, /So far, 40 saw it, 12 opened it, 5 keep it, 3 went to your links and 1 shared it\./);
  assert.match(hot.text, /https:\/\/x\.test\/s\/music\/7\/abcd1234/);
  assert.doesNotMatch(hot.text, /another 72 hours/);
  const end = makerEmail({ ...n, kind: "ending" }, "https://x.test", "https://x.test/off", now);
  assert.equal(end.subject, "Lowtide Club has 6 hours left on The Wall");
  assert.match(end.text, /Claim a new spot: https:\/\/x\.test\/\?create=1/);
  assert.match(end.text, /Stop these emails for this spot: https:\/\/x\.test\/off/);
});
