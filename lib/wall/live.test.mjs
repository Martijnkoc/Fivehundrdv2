import assert from "node:assert/strict";
import { test } from "node:test";

/* pnpm test:unit */
const { buildLiveWall, openNumbers, WALL_SIZE } = await import("./live.ts");

const story = (lane, no, extra = {}) => ({
  id: `${lane}-${no}`,
  lane,
  no,
  name: `${lane} ${no}`,
  snippet: null,
  artwork: null,
  logo: null,
  audio: null,
  audioEmbed: null,
  excerptTitle: null,
  excerpt: null,
  trailerUrl: null,
  trailerLen: null,
  links: [{ label: "x", url: "https://x.example" }],
  seed: 1,
  pal: 0,
  startsAt: "2026-09-26T10:00:00Z",
  endsAt: "2026-09-29T10:00:00Z",
  opens: 0,
  saves: 0,
  ...extra,
});

test("an empty wall is 500 open spots, taking turns lane by lane", () => {
  const wall = buildLiveWall({ now: "", stories: [], held: [] }, "https://x.supabase.co");
  assert.equal(wall.length, WALL_SIZE);
  assert.ok(wall.every((s) => s.vacant));
  assert.deepEqual(
    wall.slice(0, 7).map((s) => `${s.lane}:${s.num}`),
    ["music:1", "art:1", "writers:1", "podcasts:1", "games:1", "letters:1", "music:2"],
  );
  assert.deepEqual(wall.map((s) => s.no), Array.from({ length: 500 }, (_, i) => i + 1));
});

test("live stories come first, taking turns; open spots skip taken and held numbers", () => {
  const feed = {
    now: "",
    stories: [story("music", 7), story("music", 3), story("games", 1), story("writers", 1)],
    held: [["art", 1]],
  };
  const wall = buildLiveWall(feed, "https://x.supabase.co");
  assert.deepEqual(
    wall.slice(0, 4).map((s) => `${s.lane}:${s.num}`),
    ["music:3", "writers:1", "games:1", "music:7"],
  );
  assert.ok(wall.slice(0, 4).every((s) => !s.vacant));
  const open = wall.slice(4);
  assert.equal(wall.length, 500);
  assert.ok(!open.some((s) => `${s.lane}:${s.num}` === "art:1"), "held spots are not offered");
  assert.ok(!open.some((s) => `${s.lane}:${s.num}` === "music:3"), "live spots are not offered as open");
  assert.equal(open[0].lane, "music");
  assert.equal(open[0].num, 1);
});

test("more than 500 live stories are all on the wall, with no open spots", () => {
  const stories = [];
  for (const lane of ["music", "art", "writers", "podcasts", "games", "letters"])
    for (let n = 1; n <= 100; n++) stories.push(story(lane, n));
  const wall = buildLiveWall({ now: "", stories, held: [] }, "https://x.supabase.co");
  assert.equal(wall.length, 600);
  assert.ok(wall.every((s) => !s.vacant));
});

test("media paths become public storage URLs; the story id is the save key", () => {
  const [s] = buildLiveWall({ now: "", stories: [story("music", 1, { artwork: "p/a.jpg", audio: "p/b.mp3" })], held: [] }, "https://x.supabase.co");
  assert.equal(s.img, "https://x.supabase.co/storage/v1/object/public/art/p/a.jpg");
  assert.equal(s.audio, "https://x.supabase.co/storage/v1/object/public/audio/p/b.mp3");
  assert.equal(s.id, "music-1");
});

test("open numbers in a lane leave out live and held ones", () => {
  const nums = openNumbers({ now: "", stories: [story("music", 2)], held: [["music", 3], ["art", 4]] }, "music");
  assert.equal(nums.length, 498);
  assert.ok(!nums.includes(2) && !nums.includes(3) && nums.includes(4));
});

test("a refresh keeps the wall in place: leavers become open spots, newcomers take one", async () => {
  const { mergeFeed } = await import("./live.ts");
  const feed = { now: "", stories: [story("music", 3), story("art", 9)], held: [] };
  const wall = buildLiveWall(feed, "https://x.supabase.co");
  const before = wall.map((s) => s.no);
  const openArt2 = wall.findIndex((s) => s.vacant && s.lane === "art" && s.num === 2);
  const changed = mergeFeed(wall, { now: "", stories: [story("art", 9, { saves: 4 }), story("art", 2)], held: [] }, "https://x.supabase.co");
  assert.equal(changed, true);
  assert.deepEqual(wall.map((s) => s.no), before, "places are unchanged");
  assert.ok(wall[0].vacant && wall[0].lane === "music" && wall[0].num === 3, "music 3 left and is open again");
  assert.equal(wall[1].saves, 4, "counters follow the feed");
  assert.equal(wall[openArt2].id, "art-2", "art 2 takes its own open spot");
  assert.equal(mergeFeed(wall, { now: "", stories: [story("art", 9), story("art", 2)], held: [] }, "https://x.supabase.co"), false);
});
