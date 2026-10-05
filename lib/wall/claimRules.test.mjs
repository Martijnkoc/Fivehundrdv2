import assert from "node:assert/strict";
import { test } from "node:test";

/* pnpm test:unit: the server's check of a paid claim (app/api/checkout), before anything is held or charged */
const { checkClaim } = await import("./claimRules.ts");

const ok = { lane: "music", no: 217, name: "  Paper Moons ", links: ["open.spotify.com/artist/x"], seed: 42, pal: 3 };
const err = (patch) => checkClaim({ ...ok, ...patch }).error;

test("a valid claim comes back cleaned up", () => {
  const c = checkClaim({ ...ok, snippet: " Dream pop. ", email: "  me@example.com ", visitor: "v".repeat(80) });
  assert.equal(c.error, undefined);
  assert.equal(c.name, "Paper Moons");
  assert.equal(c.snippet, "Dream pop.");
  assert.deepEqual(c.links, [{ label: "Spotify", url: "https://open.spotify.com/artist/x" }]);
  assert.equal(c.email, "me@example.com");
  assert.equal(c.visitor.length, 64);
  assert.deepEqual([c.artwork, c.logo, c.audio], [null, null, null]);
});

test("the lane and the number must be real", () => {
  assert.equal(err({ lane: "cooking" }), "lane");
  assert.equal(err({ lane: undefined }), "lane");
  for (const no of [0, 501, 1.5, "x", null]) assert.equal(err({ no }), "no", String(no));
  assert.equal(err({ no: "500" }), undefined);
});

test("a name and at least one real link, in the form's own words", () => {
  assert.match(err({ name: "   " }), /Add your name/);
  assert.match(err({ name: "x".repeat(41) }), /Add your name/);
  assert.equal(err({ name: "x".repeat(40) }), undefined);
  assert.match(err({ links: [] }), /at least one link/);
  assert.match(err({ links: ["not a link"] }), /at least one link/);
  assert.match(err({ links: "open.spotify.com" }), /at least one link/);
  /* at most three, the rest is dropped */
  const c = checkClaim({ ...ok, links: ["a.com", "b.com", "c.com", "d.com"] });
  assert.equal(c.links.length, 3);
});

test("text limits match the database's", () => {
  assert.equal(err({ snippet: "x".repeat(141) }), "snippet");
  assert.equal(err({ snippet: "x".repeat(140) }), undefined);
  assert.equal(err({ lane: "writers", excerpt: "x".repeat(2501) }), "excerpt");
  assert.equal(err({ lane: "writers", excerpt: "x".repeat(2500) }), undefined);
});

test("media only from the pending upload folder", () => {
  const good = "pending/0123456789abcdef.jpg";
  assert.equal(checkClaim({ ...ok, artwork: good }).artwork, good);
  for (const bad of ["https://evil.example/a.jpg", "pending/../secret.jpg", "pending/short.jpg", "pending/0123456789abcdef.exe", "live/0123456789abcdef.jpg"])
    assert.equal(err({ artwork: bad }), "media", bad);
  assert.equal(err({ logo: "x" }), "media");
  assert.equal(err({ audio: "x" }), "media");
});

test("each lane keeps only its own extras", () => {
  const audio = "pending/0123456789abcdef.mp3";
  assert.equal(checkClaim({ ...ok, lane: "music", audio }).audio, audio);
  assert.equal(checkClaim({ ...ok, lane: "podcasts", audio }).audio, audio);
  assert.equal(checkClaim({ ...ok, lane: "games", audio }).audio, null);
  const ex = { excerptTitle: " Chapter one ", excerpt: " It began. " };
  assert.deepEqual(pick(checkClaim({ ...ok, lane: "writers", ...ex })), ["Chapter one", "It began."]);
  assert.deepEqual(pick(checkClaim({ ...ok, lane: "music", ...ex })), ["", ""]);
  /* a title without an excerpt isn't kept */
  assert.deepEqual(pick(checkClaim({ ...ok, lane: "letters", excerptTitle: "Alone" })), ["", ""]);
  assert.equal(checkClaim({ ...ok, lane: "games", trailerUrl: "youtube.com/watch?v=1" }).trailerUrl, "https://youtube.com/watch?v=1");
  assert.equal(checkClaim({ ...ok, lane: "music", trailerUrl: "youtube.com/watch?v=1" }).trailerUrl, "");
});
const pick = (c) => [c.excerptTitle, c.excerpt];

test("the generated pattern is a real one", () => {
  for (const p of [{ pal: 12 }, { pal: -1 }, { pal: "x" }, { seed: -1 }, { seed: "x" }]) assert.equal(err(p), "pattern", JSON.stringify(p));
  assert.equal(err({ pal: 11, seed: 0 }), undefined);
});

test("nothing at all is a bad request, not a crash", () => {
  assert.equal(checkClaim(null).error, "lane");
  assert.equal(checkClaim("x").error, "lane");
});

test("the maker's tools: audio line, coming up with a day, more images (2026-10-05)", async () => {
  const { checkWords } = await import("./claimRules.ts");
  const now = Date.parse("2026-10-05T12:00:00Z");
  const c = checkClaim({ ...ok, audioTitle: " Night Bus EP ", milestone: " Album out ", milestoneOn: "2026-10-12" }, now);
  assert.equal(c.audioTitle, "Night Bus EP");
  assert.equal(c.milestone, "Album out");
  assert.equal(c.milestoneOn, "2026-10-12");
  /* an audio line only where there's audio; a day only with words */
  assert.equal(checkClaim({ ...ok, lane: "art", audioTitle: "x" }, now).audioTitle, "");
  assert.equal(checkClaim({ ...ok, milestoneOn: "2026-10-12" }, now).milestoneOn, "");
  assert.equal(checkClaim({ ...ok, audioTitle: "x".repeat(61) }, now).error, "audioTitle");
  assert.equal(checkClaim({ ...ok, milestone: "x".repeat(49) }, now).error, "milestone");
  for (const d of ["2026-13-01", "2026-02-30", "12-10-2026", "2028-01-01", "2026-09-01"])
    assert.match(checkClaim({ ...ok, milestone: "Out", milestoneOn: d }, now).error, /date/, d);
  /* more images: Art and Games only, two at most, images only */
  const img = (n) => `pending/${"a".repeat(16)}${n}.jpg`;
  assert.deepEqual(checkClaim({ ...ok, lane: "art", gallery: [img(1), img(2), img(3)] }, now).gallery, [img(1), img(2)]);
  assert.deepEqual(checkClaim({ ...ok, gallery: [img(1)] }, now).gallery, []);
  assert.equal(checkClaim({ ...ok, lane: "games", gallery: ["https://evil.example/x.jpg"] }, now).error, "media");
  assert.equal(checkClaim({ ...ok, lane: "games", gallery: [`pending/${"a".repeat(16)}.mp3`] }, now).error, "media");
  /* a fix checks the same words, without the files */
  const w = checkWords({ name: " New name ", links: ["bandcamp.com/x"], snippet: "Better." }, "music", now);
  assert.equal(w.name, "New name");
  assert.equal(w.links[0].url, "https://bandcamp.com/x");
  assert.match(checkWords({ name: "", links: ["a.com"] }, "music", now).error, /Add your name/);
});
