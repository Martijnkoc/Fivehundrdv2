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
const MIGRATIONS = ["20260926090000_wall_v2_schema", "20260926090200_checkout_status_session", "20260926090300_sync_card", "20260926090400_moderation"];
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
  create schema storage;
  create table storage.objects (id bigint);
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

describe("safety", () => {
  const hold = (extra = {}) => reserve(story({ no: null, ipHash: "ip-a", ...extra }));
  const paid = async (s) => (await one("select public.checkout_complete($1, $2, 'pi_1', 995, 'usd') r", [KEY, s.id])).r;
  const report = async (id, ip, reason = "scam") =>
    (await one("select public.report_story($1, $2, $3, 'note', '', 'v', $4) r", [KEY, id, reason, ip])).r;
  const onWall = async (id) => (await wall()).stories.some((s) => s.id === id);

  test("one person can hold at most 3 spots, and start at most 10 checkouts an hour", async () => {
    for (let i = 0; i < 3; i++) await hold();
    await rejects(hold(), /too_many_holds/);
    await reserve(story({ no: null, ipHash: "ip-b" }));
    for (let i = 0; i < 7; i++) {
      const s = await hold({ ipHash: "ip-c" });
      await release(s.id);
    }
    await hold({ ipHash: "ip-c" });
    await hold({ ipHash: "ip-c" });
    await hold({ ipHash: "ip-c" });
    await rejects(hold({ ipHash: "ip-c" }), /too_many_holds|rate_limited/);
  });

  test("paying keeps the payment with the story", async () => {
    const s = await hold();
    assert.deepEqual(await paid(s), { lane: "music", no: s.no });
    const st = await one("select payment_intent, amount_total, currency from public.stories where id = $1", [s.id]);
    assert.deepEqual([st.payment_intent, st.amount_total, st.currency], ["pi_1", 995, "usd"]);
  });

  test("three reports take a story off the wall; a child-safety report does it at once", async () => {
    const a = await hold();
    await paid(a);
    assert.equal((await report(a.id, "r1")).hidden, false);
    assert.equal((await report(a.id, "r1")).hidden, false, "the same person twice counts once");
    assert.equal((await report(a.id, "r2")).hidden, false);
    assert.ok(await onWall(a.id));
    assert.equal((await report(a.id, "r3")).hidden, true);
    assert.ok(!(await onWall(a.id)), "hidden stories are not on the wall");
    const spot = await one("select status from public.spots where story_id = $1", [a.id]);
    assert.equal(spot.status, "live", "the spot stays taken while hidden");

    const b = await hold();
    await paid(b);
    assert.equal((await report(b.id, "r9", "child")).hidden, true);
  });

  test("approving puts it back and settles the reports; later reports start again from zero", async () => {
    const a = await hold();
    await paid(a);
    for (const ip of ["r1", "r2", "r3"]) await report(a.id, ip);
    assert.equal(await one("select public.admin_approve($1, $2) r", [KEY, a.id]).then((x) => x.r), true);
    assert.ok(await onWall(a.id));
    assert.equal((await report(a.id, "r4")).hidden, false);
    assert.equal((await report(a.id, "r5")).hidden, false);
    assert.equal((await report(a.id, "r6")).hidden, true);
  });

  test("removing frees the number and returns the payment to refund", async () => {
    const a = await hold();
    await paid(a);
    await report(a.id, "r1");
    const r = (await one("select public.admin_remove($1, $2, 'scam') r", [KEY, a.id])).r;
    assert.equal(r.paymentIntent, "pi_1");
    assert.equal(r.amount, 995);
    const spot = await one("select status from public.spots where lane = 'music' and no = $1", [a.no]);
    assert.equal(spot.status, "vacant");
    const open = await one("select count(*)::int n from public.reports where story_id = $1 and resolved_at is null", [a.id]);
    assert.equal(open.n, 0);
    assert.equal((await one("select public.checkout_status($1, $2) r", [KEY, a.id])).r.status, "removed");
    await one("select public.record_refund($1, $2, 995)", [KEY, a.id]);
    const o = (await one("select public.admin_overview($1) r", [KEY])).r;
    assert.equal(o.revenue.all, 0, "refunds come off the takings");
    assert.equal(o.revenue.refunds, 995);
  });

  test("a story removed before payment never goes live", async () => {
    const a = await hold();
    await one("select public.admin_remove($1, $2, 'scam')", [KEY, a.id]);
    assert.equal(await paid(a), null);
  });

  test("the admin lists: needs attention, live, removed", async () => {
    const a = await hold({ moderation: { verdict: "review" } });
    const b = await hold();
    const c = await hold();
    for (const s of [a, b, c]) await paid(s);
    await one("select public.admin_remove($1, $2, 'spam')", [KEY, c.id]);
    const list = async (f, q = "") => (await one("select public.admin_stories($1, $2, $3) r", [KEY, f, q])).r.map((x) => x.id);
    assert.deepEqual(await list("attention"), [a.id]);
    assert.deepEqual((await list("live")).sort(), [a.id, b.id].sort());
    assert.deepEqual(await list("removed"), [c.id]);
    assert.equal((await list("all")).length, 3);
    assert.deepEqual(await list("all", "maker@example"), (await list("all")));
    const o = (await one("select public.admin_overview($1) r", [KEY])).r;
    assert.equal(o.live, 2);
    assert.equal(o.attention, 1);
    assert.equal(o.revenue.all, 3 * 995);
    assert.equal(o.lanes.music, 2);
  });

  test("uploads: 15 an hour per person; only files of paid or held stories are kept", async () => {
    for (let i = 0; i < 15; i++) assert.equal((await one("select public.issue_upload($1, 'ip-u') r", [KEY])).r, true);
    assert.equal((await one("select public.issue_upload($1, 'ip-u') r", [KEY])).r, false);
    const a = await hold({ artwork: "pending/aaaaaaaaaaaaaaaa.jpg" });
    const b = await hold({ artwork: "pending/bbbbbbbbbbbbbbbb.jpg" });
    await release(b.id);
    const used = (await one("select public.media_in_use($1, $2) r", [KEY, ["pending/aaaaaaaaaaaaaaaa.jpg", "pending/bbbbbbbbbbbbbbbb.jpg", "pending/cccccccccccccccc.jpg"]])).r;
    assert.deepEqual(used, ["pending/aaaaaaaaaaaaaaaa.jpg"]);
    void a;
  });

  test("everything here needs the server key", async () => {
    await rejects(db.query("select public.admin_overview('nope')"), /forbidden/);
    await rejects(db.query("select public.report_story('nope', gen_random_uuid(), 'scam', '', '', '', 'x')"), /forbidden/);
  });
});
