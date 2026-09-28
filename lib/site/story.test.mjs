import assert from "node:assert/strict";
import { test } from "node:test";

/* pnpm test:unit: a discovery's metadata and structured data */
const { storyMeta, storyLd, storyPath } = await import("./story.ts");

const s = {
  id: "x",
  slug: "k3f9x2ab",
  lane: "music",
  no: 217,
  name: "Lowtide Club",
  snippet: "Slow songs for the last train home",
  artwork: "live/a.jpg",
  logo: null,
  links: [{ label: "Spotify", url: "https://open.spotify.com/artist/1" }],
  startsAt: "2026-09-20T10:00:00Z",
  endsAt: "2026-09-23T10:00:00Z",
  state: "ended",
};

test("the story, not the spot number, is the page", () => {
  assert.equal(storyPath(s), "/s/music/217/k3f9x2ab");
  const live = storyMeta({ ...s, state: "live" });
  assert.equal(live.title, "Lowtide Club on fivehundrd.");
  assert.match(live.description, /^Slow songs for the last train home\. Music, No\. 217 on The Wall, live for 72 hours/);
  const ended = storyMeta(s);
  assert.match(ended.description, /72 hours on The Wall ended September 23, 2026/);
});

test("structured data: a creative work with its own URL, and breadcrumbs through its lane", () => {
  const [work, crumbs] = storyLd(s, "https://db.example");
  assert.equal(work["@type"], "CreativeWork");
  assert.match(work.url, /\/s\/music\/217\/k3f9x2ab$/);
  assert.equal(work.genre, "Music");
  assert.equal(work.image, "https://db.example/storage/v1/object/public/art/live/a.jpg");
  assert.deepEqual(work.sameAs, ["https://open.spotify.com/artist/1"]);
  assert.equal(work.expires, s.endsAt);
  assert.ok(!("aggregateRating" in work) && !("review" in work));
  assert.deepEqual(crumbs.itemListElement.map((i) => i.name), ["Fivehundrd", "Music", "Lowtide Club"]);
  /* no artwork: the drawn link preview stands in */
  assert.match(storyLd({ ...s, artwork: null }, "https://db.example")[0].image, /\/opengraph-image$/);
});
