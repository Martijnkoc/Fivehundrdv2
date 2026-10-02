import { test } from "node:test";
import assert from "node:assert/strict";
import { endedToShow, prefillFrom, sameNumber } from "./again.ts";

const e = {
  id: "s1", slug: "abcdefgh", lane: "writers", no: 217, name: "Lowtide Club", snippet: "Slow songs.",
  artwork: "a/x.png", logo: null, audio: null, excerptTitle: "Chapter one", excerpt: "It began.", trailerUrl: null,
  links: [{ label: "Spotify", url: "https://open.spotify.com/x" }, { label: "Site", url: "http://lowtide.club" }],
  seed: 1, pal: 0, endsAt: "2026-10-01T10:00:00Z", stats: { seen: 10, opened: 4, kept: 2, clicked: 1, shared: 0 },
};

test("the Create form starts from the story as it was, files by their public address", () => {
  const p = prefillFrom(e, "https://db.example");
  assert.deepEqual(p.links, ["open.spotify.com/x", "lowtide.club", ""]);
  assert.equal(p.img, "https://db.example/storage/v1/object/public/art/a/x.png");
  assert.equal(p.logo, null);
  assert.deepEqual([p.name, p.snippet, p.exT, p.ex, p.trailer], ["Lowtide Club", "Slow songs.", "Chapter one", "It began.", ""]);
});

test("its old number only if it's open again", () => {
  assert.equal(sameNumber(e, [12, 217]), 217);
  assert.equal(sameNumber(e, [12]), null);
});

test("an ended story shows only while the maker has none live", () => {
  assert.equal(endedToShow([e], false), e);
  assert.equal(endedToShow([e], true), null);
  assert.equal(endedToShow([], false), null);
});
