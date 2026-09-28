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
const MIGRATIONS = ["20260926090000_wall_v2_schema", "20260926090200_checkout_status_session", "20260926090300_sync_card", "20260926090400_moderation", "20260926090500_durable_links", "20260926090600_founder_data", "20260926090700_indexable_stories", "20260927090000_hotspots", "20260927100000_retention", "20260927110000_call_rank", "20260927120000_hotspot_cfg", "20260927130000_reminders", "20260927140000_hotspot_not_own", "20260927150000_makers", "20260928090000_scout", "20260928095000_scout_unsave", "20260928100000_copy", "20260928110000_scout_flags_at", "20260928120000_scout_shared_ip"];
const schema = (
  await Promise.all(MIGRATIONS.map((m) => readFile(new URL(`../supabase/migrations/${m}.sql`, import.meta.url), "utf8")))
).join("\n");
const KEY = "test-server-key";

const STUBS = `
  create role anon; create role authenticated;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
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

describe("lasting links", () => {
  const byCode = async (slug) => (await one("select public.story_public($1) r", [slug])).r;

  test("every story has its own code; the link shows it live, and still after its 72 hours", async () => {
    const a = await reserve(story());
    const { slug } = await one("select slug from public.stories where id = $1", [a.id]);
    assert.match(slug, /^[a-hj-km-np-z2-9]{8}$/);
    assert.equal(await byCode(slug), null, "not before it's paid");
    await complete(a.id);
    assert.equal((await byCode(slug)).state, "live");
    assert.equal((await wall()).stories[0].slug, slug);
    await age(a.id, "73 hours");
    await db.query("select private.wall_tick()");
    const ended = await byCode(slug);
    assert.equal(ended.state, "ended");
    assert.equal(ended.name, "Lowtide Club");
    /* the number goes to someone else; the old link still finds the old story */
    const b = await reserve(story({ name: "Next Maker" }));
    await complete(b.id);
    assert.equal(b.no, 217);
    assert.equal((await byCode(slug)).name, "Lowtide Club");
  });

  test("hidden and removed stories aren't shown through their link", async () => {
    const a = await reserve(story());
    await complete(a.id);
    const { slug } = await one("select slug from public.stories where id = $1", [a.id]);
    await one("select public.admin_hide($1, $2, true)", [KEY, a.id]);
    assert.equal(await byCode(slug), null);
    await one("select public.admin_hide($1, $2, false)", [KEY, a.id]);
    await one("select public.admin_remove($1, $2, 'spam')", [KEY, a.id]);
    assert.equal(await byCode(slug), null);
  });

  test("the sitemap lists paid stories, live and ended, and never unpaid, hidden or removed ones", async () => {
    const indexable = async () => (await one("select public.stories_indexable(0, 100) r")).r.map((x) => x.slug);
    const count = async () => (await one("select public.stories_indexable_count() n")).n;
    const code = async (id) => (await one("select slug from public.stories where id = $1", [id])).slug;
    const unpaid = await reserve(story({ no: 1 }));
    const live = await reserve(story({ no: 2 }));
    await complete(live.id);
    const ended = await reserve(story({ no: 3 }));
    await complete(ended.id);
    await age(ended.id, "73 hours");
    await db.query("select private.wall_tick()");
    const hidden = await reserve(story({ no: 4 }));
    await complete(hidden.id);
    await one("select public.admin_hide($1, $2, true)", [KEY, hidden.id]);
    const removed = await reserve(story({ no: 5 }));
    await complete(removed.id);
    await one("select public.admin_remove($1, $2, 'spam')", [KEY, removed.id]);
    const list = await indexable();
    assert.deepEqual(list.sort(), [await code(live.id), await code(ended.id)].sort());
    assert.ok(!list.includes(await code(unpaid.id)));
    assert.equal(await count(), 2);
    /* public data only: callable without the server key */
    await db.exec("set role anon");
    assert.equal((await one("select public.stories_indexable_count() n")).n, 2);
    await db.exec("reset role");
  });
});

describe("the Control Room's data", () => {
  const visit = (v) => one("select public.track_visit($1, $2) r", [KEY, JSON.stringify(v)]).then((x) => x.r);
  const q = async (sql, params) => (await one(sql, [KEY, ...params])).r;
  const FROM = "2000-01-01T00:00:00Z", TO = "2100-01-01T00:00:00Z";
  const kpis = (f = {}) => q("select public.fd_kpis($1, $2, $3, $4) r", [FROM, TO, JSON.stringify(f)]);
  const live = async (extra = {}) => {
    const s = await reserve(story({ no: null, ...extra }));
    await one("select public.checkout_complete($1, $2, 'pi_' || $3, 995, 'usd')", [KEY, s.id, s.id.slice(0, 8)]);
    return s;
  };

  test("a visit records the visitor once, and says whether they're new", async () => {
    assert.equal(await visit({ visitor: "v1", source: "instagram", device: "mobile", country: "NL", landing: "/" }), true);
    assert.equal(await visit({ visitor: "v1", source: "direct", device: "mobile" }), false);
    const v = await one("select * from public.visitors where visitor = 'v1'");
    assert.deepEqual([v.source, v.device, v.country, v.visits], ["instagram", "mobile", "NL", 2]);
    assert.equal((await visit({ visitor: "v2", device: "phone", country: "Netherlands" })), true);
    const v2 = await one("select device, country, source from public.visitors where visitor = 'v2'");
    assert.deepEqual([v2.device, v2.country, v2.source], [null, null, "direct"], "only known device classes and 2-letter countries");
  });

  test("a shared link's visit counts for its story", async () => {
    const s = await live();
    const { slug } = await one("select slug from public.stories where id = $1", [s.id]);
    await visit({ visitor: "v9", source: "whatsapp", landing: `/s/music/${s.no}/${slug}`, slug });
    const k = await kpis();
    assert.equal(k.fromShares, 1);
    const spot = await q("select public.fd_spot($1, $2) r", [s.id]);
    assert.equal(spot.totals.shareVisits, 1);
    assert.deepEqual(spot.sources, [{ key: "whatsapp", visits: 1 }]);
  });

  test("headline numbers add up, and filters narrow them", async () => {
    const a = await live({ lane: "music" });
    const b = await live({ lane: "writers" });
    await visit({ visitor: "m1", source: "instagram", device: "mobile" });
    await visit({ visitor: "d1", source: "google", device: "desktop" });
    for (const [v, s] of [["m1", a], ["d1", a], ["d1", b]]) await event(s.id, "open", v);
    await event(a.id, "save", "m1");
    await event(a.id, "share", "m1");
    await q("select public.track_impressions($1, $2, $3) r", ["m1", [a.id, b.id]]);
    await q("select public.track_impressions($1, $2, $3) r", ["m1", [a.id]]);
    await q("select public.track_event($1, $2, 'create_start') r", ["m1"]);
    const k = await kpis();
    assert.equal(k.visitors, 2);
    assert.equal(k.opens, 3);
    assert.equal(k.saves, 1);
    assert.equal(k.shares, 1);
    assert.equal(k.impressions, 2, "once per story, visitor and day");
    assert.equal(k.createStarts, 1);
    assert.equal(k.paid, 2);
    assert.equal(k.gross, 2 * 995);
    assert.equal(k.liveSpots, 2);
    assert.equal(k.creators, 1, "the same maker email twice is one creator");
    const mobile = await kpis({ device: "mobile" });
    assert.deepEqual([mobile.visitors, mobile.opens, mobile.saves], [1, 1, 1]);
    const books = await kpis({ lane: "writers" });
    assert.deepEqual([books.opens, books.paid, books.liveSpots], [1, 1, 1]);
  });

  test("series come in hour or day buckets across the whole range", async () => {
    await visit({ visitor: "x" });
    const now = new Date();
    const from = new Date(now.getTime() - 5 * 3600e3).toISOString(), to = new Date(now.getTime() + 3600e3).toISOString();
    const hours = await q("select public.fd_series($1, $2, $3, 'hour', '{}', 'UTC') r", [from, to]);
    assert.equal(hours.length, 7);
    assert.equal(hours.reduce((n, h) => n + h.visits, 0), 1);
  });

  test("breakdowns by source and by lane", async () => {
    const a = await live({ lane: "games" });
    await visit({ visitor: "i1", source: "instagram" });
    await visit({ visitor: "i2", source: "instagram" });
    await visit({ visitor: "t1", source: "tiktok" });
    await event(a.id, "open", "i1");
    const src = await q("select public.fd_breakdown($1, 'source', $2, $3, '{}') r", [FROM, TO]);
    assert.deepEqual(src.map((x) => [x.key, x.visitors]), [["instagram", 2], ["tiktok", 1]]);
    assert.equal(src[0].opens, 1);
    const lanes = await q("select public.fd_breakdown($1, 'lane', $2, $3, '{}') r", [FROM, TO]);
    assert.equal(lanes.length, 6);
    assert.equal(lanes.find((l) => l.lane === "games").live, 1);
  });

  test("spots, one spot, creators and transactions", async () => {
    const a = await live();
    await event(a.id, "open", "p1");
    await event(a.id, "save", "p1");
    await q("select public.record_fee($1, $2, $3) r", [a.id, 59]);
    const spots = await q("select public.fd_spots($1, $2, $3, '{}', 'opens', '', 50, 0) r", [FROM, TO]);
    assert.equal(spots[0].id, a.id);
    assert.equal(spots[0].opens, 1);
    const spot = await q("select public.fd_spot($1, $2) r", [a.id]);
    assert.equal(spot.story.status, "live");
    assert.equal(spot.totals.saves, 1);
    assert.ok(spot.timeline.length >= 1);
    assert.equal(spot.events.length, 2);
    const creators = await q("select public.fd_creators($1, $2, $3, '{}') r", [FROM, TO]);
    assert.equal(creators[0].creator, "maker@example.com");
    const tx = await q("select public.fd_transactions($1, $2, $3, '{}') r", [FROM, TO]);
    assert.equal(tx[0].net, 995 - 59);
    await q("select public.record_dispute($1, $2, $3, $4) r", [tx[0].paymentIntent, 995, "needs_response"]);
    assert.equal((await kpis()).disputes, 995);
  });

  test("the 7-day return rate follows visitors first seen 7 to 14 days before", async () => {
    await visit({ visitor: "old" });
    await visit({ visitor: "gone" });
    await db.query("update public.visitors set first_at = now() - interval '10 days'");
    await db.query("update public.visits set at = now() - interval '10 days'");
    await db.query("insert into public.visits (visitor, at, is_new) values ('old', now() - interval '8 days', false)");
    const k = await q("select public.fd_kpis($1, $2, now(), '{}') r", [FROM]);
    assert.deepEqual([k.cohort, k.returned7], [2, 1]);
    const cohorts = await q("select public.fd_cohorts($1, 4, 'UTC') r", []);
    assert.equal(cohorts.reduce((n, c) => n + c.size, 0), 2);
  });

  test("the feed, live now and health", async () => {
    const a = await live();
    await visit({ visitor: "f1", source: "instagram" });
    await event(a.id, "open", "f1");
    const feed = await q("select public.fd_feed($1, now() - interval '1 hour', 20) r", []);
    const kinds = feed.map((x) => x.kind);
    assert.ok(kinds.includes("visit") && kinds.includes("open") && kinds.includes("paid") && kinds.includes("checkout"));
    assert.ok(feed.every((x) => !("visitor" in x) && !Object.values(x).includes("f1")), "visitors stay anonymous");
    assert.equal((await q("select public.fd_live($1) r", [])).now, 1);
    await q("select public.log_api($1, '/api/wall', 200, 40) r", []);
    await q("select public.log_api($1, '/api/wall', 500, 1500) r", []);
    await q("select public.log_ops($1, 'webhook', false, '/api/stripe/webhook', 500, 10, 'db down') r", []);
    const ops = await q("select public.fd_ops($1) r", []);
    assert.equal(ops.routes[0].requests, 2);
    assert.equal(ops.routes[0].errors, 1);
    assert.equal(ops.routes[0].slow, 1);
    assert.equal(ops.webhooks.failed24h, 1);
    assert.equal(ops.hours.length, 24);
    assert.deepEqual(ops.cron, [], "no pg_cron here");
  });

  test("exports keep their history", async () => {
    const id = await q("select public.export_create($1, $2) r", [JSON.stringify({ title: "Spots", kind: "spots", format: "csv", createdBy: "me" })]);
    await q("select public.export_update($1, $2, $3) r", [id, JSON.stringify({ status: "done", rows: 12, bytes: 900, path: "x.csv" })]);
    const list = await q("select public.export_list($1, 10) r", []);
    assert.deepEqual([list[0].status, list[0].rows], ["done", 12]);
    assert.ok(list[0].finished_at);
  });

  test("everything needs the server key", async () => {
    await rejects(db.query("select public.fd_kpis('nope', now(), now())"), /forbidden/);
    await rejects(db.query("select public.track_visit('nope', '{}')"), /forbidden/);
  });
});

describe("hotspots", () => {
  const hot = async () => (await one("select public.hot_public() r")).r;
  const ev = (id, kind, visitor) => db.query("insert into public.events (story_id, kind, visitor) values ($1, $2, $3)", [id, kind, visitor]);
  const seen = (id, visitor) => db.query("insert into public.impressions (story_id, visitor) values ($1, $2)", [id, visitor]);

  test("traction per person and per exposure; one visitor can't make a hotspot; only live stories", async () => {
    const a = await reserve(story({ no: 11 }));
    await complete(a.id);
    const b = await reserve(story({ no: 12 }));
    await complete(b.id);
    /* a: seen by 100 people, opened by 5; b: seen by 5 people, 3 of them saved it */
    for (let i = 0; i < 100; i++) await seen(a.id, "va" + i);
    for (let i = 0; i < 5; i++) await ev(a.id, "open", "va" + i);
    for (let i = 0; i < 5; i++) await seen(b.id, "vb" + i);
    for (let i = 0; i < 3; i++) {
      await ev(b.id, "open", "vb" + i);
      await ev(b.id, "save", "vb" + i);
    }
    /* one visitor clicking a lot on c doesn't count */
    const c = await reserve(story({ no: 13 }));
    await complete(c.id);
    for (let i = 0; i < 20; i++) await ev(c.id, "link_click", "same");
    await db.query("select private.refresh_hotspots()");
    const list = await hot();
    assert.deepEqual(list.map((x) => x.id), [b.id, a.id]);
    assert.equal(list[0].saves, 3);
    /* ended or removed: out */
    await one("select public.admin_remove($1, $2, 'spam')", [KEY, b.id]);
    await db.query("select private.refresh_hotspots()");
    assert.deepEqual((await hot()).map((x) => x.id), [a.id]);
  });

  test("exposure is everyone who saw it or did anything with it: no boost for being opened from Hotspots itself", async () => {
    /* the same five people open both; only a's were also counted as tile impressions (b was opened from the band) */
    const a = await reserve(story({ no: 31 }));
    await complete(a.id);
    const b = await reserve(story({ no: 32 }));
    await complete(b.id);
    for (let i = 0; i < 5; i++) {
      await seen(a.id, "p" + i);
      await ev(a.id, "open", "p" + i);
      await ev(b.id, "open", "p" + i);
    }
    /* someone who saw it this morning and saves it now still counts as exposed */
    await db.query("insert into public.impressions (story_id, visitor, at) values ($1, 'morning', now() - interval '9 hours')", [a.id]);
    await ev(a.id, "save", "morning");
    await ev(b.id, "save", "morning");
    await db.query("select private.refresh_hotspots()");
    const score = async (id) => (await one("select score from public.hotspots where story_id = $1", [id])).score;
    const [sa, sb] = [await score(a.id), await score(b.id)];
    assert.ok(Math.abs(sa - sb) < 1e-6, `${sa} vs ${sb}`);
    /* (5 opens + 4 x 1 save) / sqrt(6 exposed + 20) */
    assert.ok(Math.abs(sa - 9 / Math.sqrt(26)) < 1e-4, String(sa));
  });

  test("a maker's own activity doesn't make their spot a Hotspot", async () => {
    const a = await reserve(story({ no: 33, visitor: "maker-1" }));
    await complete(a.id);
    for (const k of ["open", "save", "share", "link_click"]) await ev(a.id, k, "maker-1");
    await ev(a.id, "open", "fan-1");
    await ev(a.id, "open", "fan-2");
    await db.query("select private.refresh_hotspots()");
    assert.deepEqual(await hot(), []);
    await ev(a.id, "open", "fan-3");
    await db.query("select private.refresh_hotspots()");
    assert.equal((await hot())[0].opens, 3);
  });

  test("the spotlight moves on: a top-5 spot's score halves every 6 hours", async () => {
    const a = await reserve(story({ no: 21 }));
    await complete(a.id);
    for (let i = 0; i < 4; i++) await ev(a.id, "save", "v" + i);
    await db.query("select private.refresh_hotspots()");
    const first = (await one("select score, top_at from public.hotspots where story_id = $1", [a.id]));
    assert.ok(first.top_at);
    await db.query("update public.hotspots set top_at = now() - interval '6 hours' where story_id = $1", [a.id]);
    await db.query("select private.refresh_hotspots()");
    const later = (await one("select score from public.hotspots where story_id = $1", [a.id])).score;
    assert.ok(Math.abs(later - first.score / 2) < 0.01, `${later} vs ${first.score}`);
    /* public: callable without the server key, and the table itself isn't readable */
    await db.exec("set role anon");
    assert.equal((await hot()).length, 1);
    await rejects(db.query("select * from public.hotspots"), /permission denied/);
    await db.exec("reset role");
  });
});


describe("retention", () => {
  const ev = (id, kind, visitor, at = "now()") => db.query(`insert into public.events (story_id, kind, visitor, at) values ($1, $2, $3, ${at})`, [id, kind, visitor]);
  const call = async (id, visitor) => (await one("select public.call_story($1, $2, $3, 'ip') r", [KEY, visitor, id])).r;
  const finds = async (visitor, ids) => (await one("select public.finds_status($1, $2, $3) r", [KEY, visitor, ids])).r;
  const live = async (extra = {}) => {
    const s = await reserve(story({ no: null, ...extra }));
    await complete(s.id);
    return s;
  };

  test("a story keeps the moment it first became a Hotspot; shares count", async () => {
    const a = await live();
    for (let i = 0; i < 3; i++) await ev(a.id, "share", "s" + i);
    await db.query("select private.refresh_hotspots()");
    const h = await one("select shares, rank from public.hotspots where story_id = $1", [a.id]);
    assert.deepEqual([h.shares, h.rank], [3, 1]);
    const first = (await one("select hot_at from public.stories where id = $1", [a.id])).hot_at;
    assert.ok(first);
    await db.query("select private.refresh_hotspots()");
    assert.equal((await one("select hot_at from public.stories where id = $1", [a.id])).hot_at.getTime(), first.getTime());
  });

  test("Call it: once per story with a frozen snapshot, also a save; three a day; not own, hot or ended stories", async () => {
    const a = await live({ visitor: "maker" });
    for (let i = 0; i < 4; i++) await ev(a.id, "open", "o" + i);
    await ev(a.id, "save", "o0");
    const r = await call(a.id, "caller");
    assert.equal(r.status, "called");
    assert.equal(r.left, 2);
    const c = await one("select * from public.calls where visitor = 'caller'");
    assert.deepEqual([c.opens, c.saves, c.was_hot, c.lane], [4, 1, false, "music"]);
    /* the call kept it */
    assert.ok(await one("select 1 from public.saves where visitor = 'caller' and story_id = $1", [a.id]));
    /* calling again doesn't move the moment */
    await db.query("update public.calls set called_at = called_at - interval '1 hour'");
    const again = await call(a.id, "caller");
    assert.equal(again.status, "called");
    assert.equal(new Date(again.calledAt).getTime(), new Date(c.called_at.getTime() - 3600e3).getTime());
    assert.equal((await call(a.id, "maker")).status, "own");
    /* which caller you were: yours alone, and it stays the same */
    assert.equal(r.rank, 1);
    assert.equal((await call(a.id, "second")).rank, 2);
    assert.equal((await call(a.id, "caller")).rank, 1);
    const [mine] = await finds("second", [a.id]);
    assert.equal(mine.call.rank, 2);
    const b = await live(), d = await live(), e = await live();
    assert.equal((await call(b.id, "caller")).status, "called");
    assert.equal((await call(d.id, "caller")).status, "called");
    assert.equal((await call(e.id, "caller")).status, "limit");
    await db.query("update public.stories set hot_at = now() where id = $1", [e.id]);
    assert.equal((await call(e.id, "other")).status, "hot");
    await age(b.id, "73 hours");
    assert.equal((await call(b.id, "other")).status, "unavailable");
    await rejects(one("select public.call_story('nope', 'v', $1)", [a.id]), /forbidden/);
  });

  test("a call comes true when the story becomes a Hotspot after it, or when saves after it double (and reach 15)", async () => {
    const a = await live(), b = await live(), c = await live();
    for (let i = 0; i < 10; i++) await ev(b.id, "save", "early" + i);
    await call(a.id, "v");
    await call(b.id, "v");
    await call(c.id, "v");
    /* b: 10 savers before, 19 after (not 2x); c: 0 before, 15 after */
    for (let i = 0; i < 19; i++) await ev(b.id, "save", "late" + i);
    for (let i = 0; i < 15; i++) await ev(c.id, "save", "late" + i);
    await db.query("select private.settle_calls()");
    const out = async (id) => (await one("select outcome from public.calls where story_id = $1", [id])).outcome;
    assert.equal(await out(b.id), null);
    assert.equal(await out(c.id), "moved");
    await ev(b.id, "save", "late19");
    await db.query("update public.stories set hot_at = now() where id = $1", [a.id]);
    await db.query("select private.settle_calls()");
    assert.equal(await out(a.id), "hotspot");
    assert.equal(await out(b.id), "moved");
    /* settled once the story is over */
    await age(a.id, "73 hours");
    await db.query("select private.settle_calls()");
    assert.ok((await one("select settled_at from public.calls where story_id = $1", [a.id])).settled_at);
  });

  test("Finds: when you saved it, how many had, found early, your call, and the maker back on the wall", async () => {
    const a = await live({ email: "Maker@Example.com" });
    /* 30 savers; you are the 2nd */
    await ev(a.id, "save", "first", "now() - interval '3 hours'");
    await ev(a.id, "save", "you", "now() - interval '2 hours'");
    for (let i = 0; i < 28; i++) await ev(a.id, "save", "later" + i, "now() - interval '1 hour'");
    await db.query("update public.stories set saves = 30 where id = $1", [a.id]);
    let [f] = await finds("you", [a.id]);
    assert.deepEqual([f.rank, f.savers, f.saves, f.early, f.gone, f.back, f.call], [2, 30, 30, true, false, null, null]);
    /* the same maker, a new spot */
    const b = await live({ email: "maker@example.com", lane: "games" });
    [f] = await finds("you", [a.id]);
    assert.equal(f.back.id, b.id);
    /* late savers aren't early; nobody else's Finds */
    const [late] = await finds("later27", [a.id]);
    assert.equal(late.early, false);
    assert.deepEqual(await finds("stranger", [a.id]), []);
    /* small stories: early only if saved before it became a Hotspot */
    const c = await live();
    await ev(c.id, "save", "you", "now() - interval '2 hours'");
    await db.query("update public.stories set hot_at = now() - interval '1 hour' where id = $1", [c.id]);
    const [small] = await finds("you", [c.id]);
    assert.equal(small.early, true);
  });

  test("the Control Room's retention numbers", async () => {
    const a = await live();
    await call(a.id, "caller");
    await db.query("update public.stories set hot_at = now() + interval '2 hours' where id = $1", [a.id]);
    await db.query("select private.settle_calls()");
    await one("select public.track_surface($1, 'v1', 'since_shown', null, '{\"holdout\":false}')", [KEY]);
    await one("select public.track_surface($1, 'v2', 'since_shown', null, '{\"holdout\":true}')", [KEY]);
    await one("select public.track_surface($1, 'v1', 'hot_tap', $2, null)", [KEY, a.id]);
    assert.equal((await one("select public.track_surface($1, 'v1', 'create_start') r", [KEY])).r, false);
    const r = (await one("select public.fd_retention($1, now() - interval '1 day', now() + interval '1 day') r", [KEY])).r;
    assert.deepEqual([r.calls.made, r.calls.hotspot, Math.round(r.calls.hoursToHotspot)], [1, 1, 2]);
    assert.deepEqual([r.since.shown, r.since.holdout, r.taps.hot, r.taps.hotKept], [1, 1, 1, 0]);
    await rejects(one("select public.fd_retention('nope', now(), now())"), /forbidden/);
  });
});

describe("reminders", () => {
  const due = async () => (await one("select public.reminders_due($1) r", [KEY])).r;
  const U = "00000000-0000-4000-a000-000000000001";
  const live = async (no) => {
    const s = await reserve(story({ no }));
    await complete(s.id);
    return s;
  };

  test("a kept card hears about saved stories ending within the hour, once; anonymous saves and far-off endings don't", async () => {
    await db.query("insert into auth.users values ($1, 'fan@example.com')", [U]);
    await db.query("insert into public.profiles (user_id, remind) values ($1, true)", [U]);
    const soon = await live(41), later = await live(42), anon = await live(43);
    await age(soon.id, "71 hours 30 minutes");
    await age(anon.id, "71 hours 30 minutes");
    await db.query("insert into public.saves (visitor, user_id, story_id) values ('v', $1, $2), ('v', $1, $3)", [U, soon.id, later.id]);
    await db.query("insert into public.saves (visitor, story_id) values ('nobody', $1)", [anon.id]);
    const d = await due();
    assert.equal(d.length, 1);
    assert.equal(d[0].email, "fan@example.com");
    assert.deepEqual(d[0].stories.map((s) => s.id), [soon.id]);
    assert.equal((await one("select public.reminders_sent($1, $2, $3) r", [KEY, U, [soon.id]])).r, 1);
    assert.deepEqual(await due(), []);
    /* the email's off link */
    await db.query("delete from public.reminders");
    assert.equal((await one("select public.remind_off($1, $2) r", [KEY, U])).r, true);
    assert.deepEqual(await due(), []);
    await rejects(one("select public.reminders_due('nope')"), /forbidden/);
    /* without the site's address in Vault, the ping does nothing */
    await db.query("select private.ping_reminders()");
  });
});

describe("makers", () => {
  const ev = (id, kind, visitor) => db.query("insert into public.events (story_id, kind, visitor) values ($1, $2, $3)", [id, kind, visitor]);
  const due = async () => (await one("select public.maker_notices_due($1) r", [KEY])).r;

  test("a maker sees their own spot's numbers, people only and without themselves; nobody else can", async () => {
    const s = await reserve(story({ no: 51, visitor: "maker-1" }));
    await complete(s.id);
    await db.query("insert into public.impressions (story_id, visitor) values ($1, 'a'), ($1, 'b'), ($1, 'c'), ($1, 'maker-1')", [s.id]);
    for (const v of ["a", "b", "maker-1"]) await ev(s.id, "open", v);
    await ev(s.id, "link_click", "a");
    await ev(s.id, "link_click", "a");
    await ev(s.id, "share", "b");
    await db.query("insert into public.saves (visitor, story_id) values ('a', $1), ('maker-1', $1)", [s.id]);
    await ev(s.id, "open", "d"); /* opened from a shared link without seeing the tile */
    const [m] = (await one("select public.maker_stats($1, 'maker-1', $2) r", [KEY, [s.id]])).r;
    assert.deepEqual([m.seen, m.opened, m.kept, m.clicked, m.shared, m.hotAt], [4, 3, 1, 1, 1, null]);
    assert.deepEqual((await one("select public.maker_stats($1, 'someone-else', $2) r", [KEY, [s.id]])).r, []);
  });

  test("emails: once when it becomes a Hotspot, once with 6 hours left, never after stop", async () => {
    const s = await reserve(story({ no: 52 }));
    await complete(s.id);
    assert.deepEqual(await due(), []);
    await db.query("update public.stories set hot_at = now() where id = $1", [s.id]);
    let d = await due();
    assert.deepEqual(d.map((x) => [x.kind, x.email, x.name]), [["hot", "maker@example.com", "Lowtide Club"]]);
    assert.equal(typeof d[0].stats.seen, "number");
    await one("select public.maker_notice_sent($1, $2, 'hot')", [KEY, s.id]);
    assert.deepEqual(await due(), []);
    await age(s.id, "67 hours");
    d = await due();
    assert.deepEqual(d.map((x) => x.kind), ["ending"]);
    await one("select public.maker_notices_off($1, $2)", [KEY, s.id]);
    assert.deepEqual(await due(), []);
    await rejects(one("select public.maker_notices_due('nope')"), /forbidden/);
  });
});
