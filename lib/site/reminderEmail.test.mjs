import assert from "node:assert/strict";
import { test } from "node:test";

/* pnpm test:unit */
const { reminderEmail } = await import("./reminderEmail.ts");
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

test("several Finds, soonest first as given, with minutes when it's under the hour", () => {
  const m = reminderEmail([s("A", 20), s("B", 65, { lane: "writers", no: 212 })], "https://x.test", "https://x.test/off", now);
  assert.equal(m.subject, "2 of your Finds leave The Wall within the hour");
  assert.match(m.text, /A \(Music, No\. 007\) ends in 20 minutes/);
  assert.match(m.text, /B \(Books, No\. 212\) ends in an hour/);
});
