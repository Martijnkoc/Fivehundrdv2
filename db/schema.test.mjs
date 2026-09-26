import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { beforeEach, describe, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

/*
 * The Supabase schema (supabase/migrations) on an in-process Postgres.
 * Auth, Vault, the API roles and the teaser tables are stubbed; everything
 * the wall does goes through the same functions the app calls.
 */
/* every migration but the platform one (pg_cron, Storage: Supabase only) */
const MIGRATIONS = ["20260926090000_wall_v2_schema", "20260926090200_checkout_status_session", "20260926090300_sync_card"];
const schema = (
  await Promise.all(MIGRATIONS.map((m) => readFile(new URL(`../supabase/migrations/${m}.sql`, import.meta.url), "utf8")))
).join("\n");
const KEY = "test-server-key";

const STUBS = `
  create role anon; create role authenticated;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema vault;
  create table vault.decrypted_secrets (name text, decrypted_secret text);
  insert into vault.decrypted_secrets values ('fivehundrd_server_key', '${KEY}');
  create table public.early_access_signups (id bigint);
  create table public.early_access_events (id bigint);
`;

let db;
beforeEach(async () => {
  db = new PGlite();
  await db.exec(STUBS);
  await db.exec(schema);
});

const one = async (sql, params) => (await db.query(sql, params)).rows[0];
const story = (extra = {}) => ({
  lane: "music",
  no: 217,
  name: "Lowtide Club",
  snippet: "Slow songs for the last train home.",
  links: [{ label: "Spotify", url: "https://open.spotify.com/x" }],
  seed: 1,
  pal: 0,
  email: "maker@example.com",
  visitor: "v1",
  ...extra,
});
const reserve = async (s, key = KEY) => (await one("select public.checkout_reserve($1, $2) r", [key, JSON.stringify(s)])).r;
const complete = async (id) => (await one("select public.checkout_complete($1, $2) r", [KEY, id])).r;
const release = async (id) => (await one("select public.checkout_release($1, $2) r", [KEY, id])).r;
const wall = async () => (await one("select public.wall_public() r")).r;
const event = async (id, kind, visitor = "v1") =>
  (await one("select public.record_event($1, $2, $3, $4, 'ip') r", [KEY, id, kind, visitor])).r;
const age = (id, interval) =>
  db.query(`update public.stories set starts_at = starts_at - interval '${interval}', ends_at = ends_at - interval '${interval}' where id = $1`, [id]);
const rejects = (promise, pattern) => assert.rejects(promise, pattern);

describe("spots: 500 per lane", () => {
  test("seeds 3,000 vacant spots, 500 in each of the six lanes", async () => {
    const { rows } = await db.query(
      "select lane, count(*)::int n, min(no) lo, max(no) hi from public.spots where status = 'vacant' group by lane order by lane",
    );
    assert.equal(rows.length, 6);
    for (const r of rows) assert.deepEqual([r.n, r.lo, r.hi], [500, 1, 500]);
  });

  test("reserves the requested number, and the same number in another lane is another spot", async () => {
    const a = await reserve(story());
    const b = await reserve(story({ lane: "writers" }));
    assert.deepEqual([a.lane, a.no, b.lane, b.no], ["music", 217, "writers", 217]);
  });

  test("a taken number is swapped for another open one in the same lane", async () => {
    await reserve(story());
    const b = await reserve(story());
    assert.equal(b.lane, "music");
    assert.notEqual(b.no, 217);
    const spot = await one("select status from public.spots where lane = 'music' and no = $1", [b.no]);
    assert.equal(spot.status, "reserved");
  });

  test("only the server key can reserve", async () => {
    await rejects(reserve(story(), "wrong"), /forbidden/);
    await rejects(reserve(story(), null), /forbidden/);
  });
});

describe("checkout lifecycle (§15)", () => {
  test("reserve, attach the session, go live for 72 hours; the webhook may repeat", async () => {
    const r = await reserve(story());
    const expires = Math.floor(Date.now() / 1000) + 30 * 60 + 5;
    assert.equal((await one("select public.checkout_attach($1, $2, 'cs_test_1', $3) r", [KEY, r.id, expires])).r, true);
    const held = await one("select extract(epoch from reserved_until)::bigint t from public.spots where story_id = $1", [r.id]);
    assert.equal(Number(held.t), expires);
    assert.deepEqual(await complete(r.id), { lane: "music", no: 217 });
    assert.equal(await complete(r.id), null, "webhook retries are no-ops");
    const s = await one("select extract(epoch from ends_at - starts_at)::int / 3600 h from public.stories where id = $1", [r.id]);
    assert.equal(s.h, 72);
  });

  test("an expired checkout frees the number, and a late webhook does not go live", async () => {
    const r = await reserve(story());
    assert.equal(await release(r.id), true);
    assert.equal(await complete(r.id), null);
    const again = await reserve(story({ name: "Paper Engines" }));
    assert.equal(again.no, 217);
  });

  test("the minute tick frees abandoned checkouts and ended spots", async () => {
    const abandoned = await reserve(story());
    await db.query("update public.spots set reserved_until = now() - interval '1 second' where story_id = $1", [abandoned.id]);
    const live = await reserve(story({ no: 5 }));
    await complete(live.id);
    await age(live.id, "72 hours");
    await db.query("select private.wall_tick()");
    const { rows } = await db.query("select no, status from public.spots where lane = 'music' and no in (5, 217) order by no");
    assert.deepEqual(rows, [
      { no: 5, status: "vacant" },
      { no: 217, status: "vacant" },
    ]);
  });

  test("checkout_status reports where a checkout stands", async () => {
    const r = await reserve(story());
    const st = async () => (await one("select public.checkout_status($1, $2) r", [KEY, r.id])).r;
    assert.equal((await st()).status, "reserved");
    await complete(r.id);
    assert.equal((await st()).status, "live");
    await rejects(one("select public.checkout_status('nope', $1)", [r.id]), /forbidden/);
  });
});

describe("the public wall", () => {
  test("shows live stories and held spots, never the maker's email", async () => {
    const live = await reserve(story());
    await complete(live.id);
    await reserve(story({ lane: "games", no: 9 }));
    const w = await wall();
    assert.equal(w.stories.length, 1);
    assert.equal(w.stories[0].name, "Lowtide Club");
    assert.equal(w.stories[0].no, 217);
    assert.ok(!JSON.stringify(w).includes("maker@example.com"));
    assert.deepEqual(w.held, [["games", 9]]);
  });

  test("an ended story leaves the wall even before the tick", async () => {
    const r = await reserve(story());
    await complete(r.id);
    await age(r.id, "73 hours");
    assert.equal((await wall()).stories.length, 0);
  });
});

describe("events and saves (§6, §11)", () => {
  test("an open counts once per visitor per story per day", async () => {
    const r = await reserve(story());
    await complete(r.id);
    assert.equal(await event(r.id, "open"), true);
    assert.equal(await event(r.id, "open"), false);
    assert.equal(await event(r.id, "open", "v2"), true);
    assert.equal((await one("select opens from public.stories where id = $1", [r.id])).opens, 2);
  });

  test("save and unsave are counted per visitor", async () => {
    const r = await reserve(story());
    await complete(r.id);
    assert.equal(await event(r.id, "save"), true);
    assert.equal(await event(r.id, "save"), false, "a second save by the same visitor doesn't count");
    assert.equal(await event(r.id, "save", "v2"), true);
    assert.equal(await event(r.id, "unsave"), true);
    assert.equal((await one("select saves from public.stories where id = $1", [r.id])).saves, 1);
  });

  test("events for a story that never went live are ignored", async () => {
    const r = await reserve(story());
    assert.equal(await event(r.id, "open"), false);
  });

  test("a save survives its spot ending and the number's next holder", async () => {
    const first = await reserve(story());
    await complete(first.id);
    await event(first.id, "save");
    await age(first.id, "72 hours");
    await db.query("select private.wall_tick()");
    const next = await reserve(story({ name: "Paper Engines" }));
    await complete(next.id);
    assert.equal(next.no, 217);
    const { rows } = await db.query("select s.name from public.saves join public.stories s on s.id = saves.story_id where saves.visitor = 'v1'");
    assert.deepEqual(rows, [{ name: "Lowtide Club" }]);
  });
});

describe("stories", () => {
  test("carry only their own lane's extra block", async () => {
    await reserve(story({ audio: "pending/a.mp3" }));
    await reserve(story({ lane: "writers", excerptTitle: "Chapter one", excerpt: "The letters stopped." }));
    await reserve(story({ lane: "games", trailerUrl: "https://youtube.com/watch?v=x" }));
    await rejects(reserve(story({ lane: "games", no: 3, audio: "pending/b.mp3" })), /check constraint/);
    await rejects(reserve(story({ no: 4, excerpt: "Nope." })), /check constraint/);
  });

  test("enforce the form's limits", async () => {
    await rejects(reserve(story({ name: "x".repeat(41) })), /check constraint/);
    await rejects(reserve(story({ snippet: "x".repeat(141) })), /check constraint/);
    await rejects(reserve(story({ links: [] })), /check constraint/);
    await rejects(reserve(story({ links: [{}, {}, {}, {}] })), /check constraint/);
    await rejects(reserve(story({ lane: "jazz" })), /lane_full|foreign key/);
  });
});

describe("access", () => {
  test("anon can read the wall but not the tables", async () => {
    await db.exec("set role anon");
    await wall();
    await rejects(db.query("select * from public.stories"), /permission denied/);
    await rejects(db.query("select private.wall_tick()"), /permission denied/);
  });
});

describe("keep my card", () => {
  test("logging in takes this browser's saves to the account and brings back the others", async () => {
    const a = await reserve(story());
    const b = await reserve(story({ no: 5 }));
    await complete(a.id);
    await complete(b.id);
    await event(a.id, "save", "phone");
    await event(b.id, "save", "laptop");
    const user = "7d0a9a64-6c55-4b7e-9d1f-2b1bb0c7a001";
    await db.query("insert into auth.users values ($1)", [user]);
    await db.exec("set role anon");
    await rejects(db.query("select public.sync_card('phone')"), /permission denied/);
    await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub = '${user}'`);
    let saves = (await one("select public.sync_card('phone', false) r")).r;
    assert.deepEqual(saves.map((x) => x.no), [217]);
    saves = (await one("select public.sync_card('laptop') r")).r;
    assert.deepEqual(saves.map((x) => x.no).sort((p, q) => p - q), [5, 217]);
    await db.exec("reset role");
    assert.equal((await one("select remind from public.profiles where user_id = $1", [user])).remind, false);
  });
});
