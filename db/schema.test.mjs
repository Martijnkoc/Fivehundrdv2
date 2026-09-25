import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { beforeEach, describe, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  freeExpiredSpots,
  goLive,
  holdUntilCheckoutExpires,
  releaseReservation,
  releaseStaleReservations,
  reserveSpot,
} from "./queries.mjs";

const schema = await readFile(new URL("./migrations/0001_init.sql", import.meta.url), "utf8");

let db;
beforeEach(async () => {
  db = new PGlite();
  await db.exec(schema);
});

async function story(lane, no, extra = {}) {
  const fields = {
    lane,
    spot_no: no,
    name: "Lowtide Club",
    artwork_key: "art/1.jpg",
    links: JSON.stringify([{ label: "Spotify", url: "https://open.spotify.com/x" }]),
    seed: 1,
    maker_email: "maker@example.com",
    ...extra,
  };
  const keys = Object.keys(fields);
  const { rows } = await db.query(
    `insert into stories (${keys.join(", ")}) values (${keys.map((_, i) => `$${i + 1}`).join(", ")}) returning id`,
    Object.values(fields),
  );
  return rows[0].id;
}

const rejects = (promise, pattern) => assert.rejects(promise, pattern);

describe("spots: 500 per lane", () => {
  test("seeds 3,000 vacant spots, 500 in each of the six lanes", async () => {
    const { rows } = await db.query(
      "select lane, count(*)::int as n, min(no) as lo, max(no) as hi from spots where status = 'vacant' group by lane order by lane",
    );
    assert.equal(rows.length, 6);
    for (const row of rows) assert.deepEqual([row.n, row.lo, row.hi], [500, 1, 500]);
  });

  test("the same number is a different spot in each lane", async () => {
    const music = await story("music", 217);
    const books = await story("writers", 217);
    assert.equal((await db.query(reserveSpot, ["music", 217, music])).rows.length, 1);
    assert.equal((await db.query(reserveSpot, ["writers", 217, books])).rows.length, 1);
  });

  test("a second checkout for a taken spot gets 0 rows", async () => {
    const first = await story("games", 42);
    const second = await story("games", 42);
    assert.equal((await db.query(reserveSpot, ["games", 42, first])).rows.length, 1);
    assert.equal((await db.query(reserveSpot, ["games", 42, second])).rows.length, 0);
  });

  test("a story cannot sit on another lane's or number's spot", async () => {
    const id = await story("music", 1);
    await rejects(db.query(reserveSpot, ["writers", 1, id]), /foreign key/);
    await rejects(db.query(reserveSpot, ["music", 2, id]), /foreign key/);
  });

  test("numbers outside 1–500 and unknown lanes are rejected", async () => {
    await rejects(story("music", 501), /check constraint/);
    await rejects(story("jazz", 1), /foreign key/);
  });
});

describe("spot lifecycle", () => {
  test("reserve, go live on the webhook, expire after 72 hours", async () => {
    const id = await story("podcasts", 9);
    await db.query(reserveSpot, ["podcasts", 9, id]);
    assert.equal((await db.query(goLive, [id])).rows.length, 1);
    assert.equal((await db.query(goLive, [id])).rows.length, 0, "webhook retries are no-ops");

    const { rows } = await db.query("select extract(epoch from ends_at - starts_at)::int / 3600 as hours from stories where id = $1", [id]);
    assert.equal(rows[0].hours, 72);

    await db.query("update stories set starts_at = starts_at - interval '72 hours', ends_at = ends_at - interval '72 hours' where id = $1", [id]);
    assert.deepEqual((await db.query(freeExpiredSpots)).rows, [{ lane: "podcasts", no: 9 }]);
    const spot = await db.query("select status, story_id from spots where lane = 'podcasts' and no = 9");
    assert.deepEqual(spot.rows[0], { status: "vacant", story_id: null });
  });

  test("an abandoned checkout frees the number after 30 minutes", async () => {
    const id = await story("letters", 300);
    await db.query(reserveSpot, ["letters", 300, id]);
    const { rows: held } = await db.query(
      "select extract(epoch from reserved_until - now())::int / 60 as minutes from spots where story_id = $1",
      [id],
    );
    assert.equal(held[0].minutes, 30, "matches the Stripe Checkout session");
    assert.equal((await db.query(releaseStaleReservations)).rows.length, 0);
    await db.query("update spots set reserved_until = now() - interval '1 second' where story_id = $1", [id]);
    assert.deepEqual((await db.query(releaseStaleReservations)).rows, [{ lane: "letters", no: 300 }]);
    assert.equal((await db.query(goLive, [id])).rows.length, 0, "a late webhook does not go live");
  });

  test("the reservation ends exactly when the Checkout session does", async () => {
    const id = await story("music", 12);
    await db.query(reserveSpot, ["music", 12, id]);
    const expiresAt = Math.floor(Date.now() / 1000) + 30 * 60 + 2;
    assert.equal((await db.query(holdUntilCheckoutExpires, [id, expiresAt])).rows.length, 1);
    const { rows } = await db.query("select extract(epoch from reserved_until)::bigint as at from spots where story_id = $1", [id]);
    assert.equal(Number(rows[0].at), expiresAt);
  });

  test("an expired Checkout session frees the number straight away", async () => {
    const id = await story("music", 13);
    await db.query(reserveSpot, ["music", 13, id]);
    assert.deepEqual((await db.query(releaseReservation, [id])).rows, [{ lane: "music", no: 13 }]);
    assert.equal((await db.query(goLive, [id])).rows.length, 0);
    const next = await story("music", 13, { name: "Paper Engines" });
    assert.equal((await db.query(reserveSpot, ["music", 13, next])).rows.length, 1);
  });

  test("status and story stay consistent", async () => {
    await rejects(db.query("update spots set status = 'live' where lane = 'music' and no = 1"), /check constraint/);
    const id = await story("music", 1);
    await rejects(db.query("update spots set story_id = $1 where lane = 'music' and no = 1", [id]), /check constraint/);
  });
});

describe("stories", () => {
  test("need artwork or a logo", async () => {
    await rejects(story("music", 1, { artwork_key: null }), /check constraint/);
    await story("music", 1, { artwork_key: null, logo_key: "logo/1.png" });
  });

  test("carry only their own lane's extra block", async () => {
    await story("music", 1, { audio_key: "audio/1.mp3" });
    await story("podcasts", 1, { audio_embed_url: "https://open.spotify.com/embed/episode/x" });
    await story("writers", 1, { excerpt_title: "Chapter one", excerpt: "The letters stopped on a Tuesday." });
    await story("games", 1, { trailer_url: "https://youtube.com/watch?v=x", trailer_len: "1:01" });
    await rejects(story("games", 2, { audio_key: "audio/2.mp3" }), /check constraint/);
    await rejects(story("music", 2, { excerpt: "Nope." }), /check constraint/);
    await rejects(story("writers", 2, { trailer_url: "https://youtube.com/watch?v=y" }), /check constraint/);
  });

  test("enforce the form's limits", async () => {
    await rejects(story("music", 1, { name: "x".repeat(41) }), /check constraint/);
    await rejects(story("music", 1, { snippet: "x".repeat(141) }), /check constraint/);
    await rejects(story("writers", 1, { excerpt: "x".repeat(2501) }), /check constraint/);
    await rejects(story("music", 1, { links: "[]" }), /check constraint/);
    await rejects(story("music", 1, { links: JSON.stringify([{}, {}, {}, {}]) }), /check constraint/);
  });
});

describe("saves and events", () => {
  test("a save survives its spot ending and the number's next holder", async () => {
    const first = await story("music", 5);
    await db.query(reserveSpot, ["music", 5, first]);
    await db.query(goLive, [first]);
    await db.query("insert into saves (visitor, story_id) values ('v1', $1)", [first]);
    await db.query("update stories set starts_at = starts_at - interval '72 hours', ends_at = ends_at - interval '72 hours' where id = $1", [first]);
    await db.query(freeExpiredSpots);

    const next = await story("music", 5, { name: "Paper Engines" });
    await db.query(reserveSpot, ["music", 5, next]);
    await db.query(goLive, [next]);

    const { rows } = await db.query("select s.name from saves join stories s on s.id = saves.story_id where visitor = 'v1'");
    assert.deepEqual(rows, [{ name: "Lowtide Club" }]);
  });

  test("an open counts once per visitor per story per day", async () => {
    const id = await story("art", 3);
    const open = "insert into events (story_id, kind, visitor) values ($1, 'open', $2) on conflict do nothing returning id";
    assert.equal((await db.query(open, [id, "v1"])).rows.length, 1);
    assert.equal((await db.query(open, [id, "v1"])).rows.length, 0);
    assert.equal((await db.query(open, [id, "v2"])).rows.length, 1);
    await db.query("insert into events (story_id, kind, visitor) values ($1, 'link_click', 'v1'), ($1, 'link_click', 'v1')", [id]);
  });
});
