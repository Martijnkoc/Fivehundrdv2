import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { beforeEach, describe, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

/*
 * Scout (docs/scout.md) on an in-process Postgres, with the same stubs as
 * schema.test.mjs: calls and their frozen snapshots, duplicates, the checks
 * that keep a call from counting, signing in, verdicts, reputation, tiers
 * and sharing. Every migration but the platform one, in order.
 */
const dir = new URL("../supabase/migrations/", import.meta.url);
const files = (await readdir(dir)).filter((f) => f.endsWith(".sql") && !f.includes("_platform")).sort();
const schema = (await Promise.all(files.map((f) => readFile(new URL(f, dir), "utf8")))).join("\n");
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
const U1 = "00000000-0000-4000-8000-000000000001";
const U2 = "00000000-0000-4000-8000-000000000002";
const user = (id, email = null) => db.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);

/** A live story on spot `no` in Music, made by browser `maker`. */
async function live(no = 1, extra = {}) {
  const r = (await one("select public.checkout_reserve($1, $2) r", [KEY, JSON.stringify({
    lane: "music", no, name: "Story " + no, snippet: "", links: [{ label: "Site", url: "https://example.com" }],
    seed: 1, pal: 0, email: "maker@example.com", visitor: "maker", ...extra,
  })])).r;
  await one("select public.checkout_complete($1, $2)", [KEY, r.id]);
  return r.id;
}
const event = (story, kind, visitor, u = null) => one("select public.record_event($1, $2, $3, $4, 'ip', $5) r", [KEY, story, kind, visitor, u]);
/** Opens, then keeps: a Timeheart as the app sends it. */
const keep = async (story, visitor, u = null) => {
  await event(story, "open", visitor, u);
  return event(story, "save", visitor, u);
};
const calls = async (where = "true", params = []) => (await db.query(`select * from public.scout_calls where ${where} order by id`, params)).rows;
const attach = async (u, visitor, story = null) => (await one("select public.scout_attach($1, $2, $3, $4) r", [KEY, u, visitor, story])).r;
const me = async (u) => (await one("select public.scout_me($1, $2) r", [KEY, u])).r;
const settle = () => db.query("select private.settle_calls()");
/** Its 72 hours are over: the story moves back in time, its activity with it (calls can't move: their time is fixed). */
const end = async (story) => {
  await db.query("update public.stories set starts_at = starts_at - interval '72 hours', ends_at = ends_at - interval '72 hours' where id = $1", [story]);
  await db.query("update public.events set at = at - interval '1 hour' where story_id = $1", [story]);
};

describe("Scout calls", () => {
  test("a signed-in Timeheart is a call with the story frozen as it was", async () => {
    await user(U1);
    const s = await live();
    await keep(s, "a");
    await keep(s, "b");
    await event(s, "open", "c");
    await keep(s, "me", U1);
    const [c] = await calls("user_id = $1", [U1]);
    assert.equal(c.source, "signed_in");
    assert.equal(c.scored, true);
    assert.deepEqual(c.flags, []);
    assert.equal(c.keepers_before, 2);
    assert.equal(c.position, 3);
    assert.equal(c.opens, 4, "a, b, c and me had opened it");
    assert.equal(c.was_hot, false);
    /* the others were anonymous: history, never reputation */
    assert.deepEqual((await calls("user_id is null")).map((x) => [x.visitor, x.source, x.scored]), [["a", "anonymous", false], ["b", "anonymous", false]]);
  });

  test("the snapshot can't be rewritten", async () => {
    await user(U1);
    const s = await live();
    await keep(s, "me", U1);
    await assert.rejects(db.query("update public.scout_calls set position = 5"), /snapshot is fixed/);
    await assert.rejects(db.query("update public.scout_calls set keepers_before = 0, called_at = now() - interval '1 day'"), /snapshot is fixed/);
    await assert.rejects(db.query("update public.scout_calls set user_id = $1", [U2]), /account is fixed/);
  });

  test("one call per account and story: another browser, or keeping it again, doesn't make a second", async () => {
    await user(U1);
    const s = await live();
    await keep(s, "phone", U1);
    await keep(s, "laptop", U1);
    await event(s, "unsave", "phone", U1);
    assert.equal((await calls("user_id = $1 and hidden_at is not null", [U1])).length, 1, "letting go hides it");
    await keep(s, "phone", U1);
    const rows = await calls("user_id = $1", [U1]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].visitor, "phone");
    assert.equal(rows[0].hidden_at, null, "keeping it again brings it back, same call");
  });

  test("letting go on another device (no saves row there) still hides the account's call", async () => {
    await user(U1);
    const s = await live();
    await keep(s, "phone", U1);
    assert.equal((await event(s, "unsave", "tablet", U1)).r, true);
    assert.equal((await calls("user_id = $1 and hidden_at is not null", [U1])).length, 1);
    assert.equal((await one("select count(*)::int n from public.saves where story_id = $1", [s])).n, 0);
    assert.equal((await one("select saves from public.stories where id = $1", [s])).saves, 0);
    /* signed out, another browser can't let go of someone else's */
    await keep(s, "phone", U1);
    assert.equal((await event(s, "unsave", "stranger")).r, false);
    assert.equal((await calls("user_id = $1 and hidden_at is null", [U1])).length, 1);
  });

  test("your own story, and a Timeheart without opening, never count", async () => {
    await user(U1, "maker@example.com");
    const s = await live();
    await keep(s, "maker", U1);
    const s2 = await live(2, { email: "someone@example.com", visitor: "someone" });
    await event(s2, "save", "me2", U1);
    const rows = await calls("user_id = $1", [U1]);
    assert.deepEqual(rows.map((r) => [r.scored, r.flags]), [[false, ["own"]], [false, ["no_open"]]]);
  });

  test("more than 20 counted calls a day, or 10 in a minute, stop counting", async () => {
    await user(U1);
    const stories = [];
    for (let i = 1; i <= 22; i++) stories.push(await live(i));
    /* twenty counted calls earlier today, outside the minute */
    for (const s of stories.slice(0, 20))
      await db.query(
        `insert into public.scout_calls (user_id, visitor, story_id, lane, called_at, source, keepers_before, position, opens, exposed, was_hot, story_age_min, scored)
         values ($1, 'me', $2, 'music', greatest(date_trunc('day', now() at time zone 'UTC') at time zone 'UTC', now() - interval '2 minutes'), 'signed_in', 0, 1, 1, 1, false, 1, true)`,
        [U1, s],
      );
    await keep(stories[20], "me", U1);
    const [capped] = await calls("story_id = $1", [stories[20]]);
    assert.ok(capped.flags.includes("daily_cap"));
    assert.equal(capped.scored, false);
  });

  test("a burst of Timehearts stops counting", async () => {
    await user(U1);
    const stories = [];
    for (let i = 1; i <= 11; i++) stories.push(await live(i));
    for (const s of stories) await keep(s, "me", U1);
    const rows = await calls("user_id = $1", [U1]);
    assert.equal(rows.filter((r) => r.scored).length, 10);
    assert.ok(rows[10].flags.includes("burst"));
  });
});

describe("signing in", () => {
  test("this browser's calls become the account's history; only the Timeheart that led here can count", async () => {
    await user(U1);
    const a = await live(1);
    const b = await live(2);
    await keep(a, "v");
    await keep(b, "v");
    const r = await attach(U1, "v", a);
    assert.deepEqual(r, { migrated: 1, counted: 1 });
    const rows = await calls("user_id = $1", [U1]);
    assert.deepEqual(rows.map((x) => [x.story_id === a, x.source, x.scored]), [[true, "signed_in", true], [false, "migrated", false]]);
    assert.equal((await one("select count(*)::int n from public.saves where user_id = $1", [U1])).n, 2);
    /* signing in again changes nothing */
    assert.deepEqual(await attach(U1, "v", a), { migrated: 0, counted: 0 });
  });

  test("the Timeheart that led here only counts within 30 minutes", async () => {
    await user(U1);
    const a = await live(1);
    await db.query(
      `insert into public.scout_calls (visitor, story_id, lane, called_at, source, keepers_before, position, opens, exposed, was_hot, story_age_min, scored)
       values ('v', $1, 'music', now() - interval '31 minutes', 'anonymous', 0, 1, 1, 1, false, 1, false)`,
      [a],
    );
    await attach(U1, "v", a);
    const [c] = await calls("user_id = $1", [U1]);
    assert.deepEqual([c.source, c.scored], ["migrated", false]);
  });

  test("the account's own call wins over a browser's duplicate", async () => {
    await user(U1);
    const s = await live();
    await keep(s, "laptop", U1);
    await keep(s, "phone");
    await attach(U1, "phone");
    const rows = await calls("story_id = $1", [s]);
    assert.equal(rows.length, 1);
    assert.deepEqual([rows[0].visitor, rows[0].source], ["laptop", "signed_in"]);
  });

  test("saves from before calls existed get a history row from the event log, flagged, never counted", async () => {
    await user(U1);
    const s = await live();
    await keep(s, "x");
    await db.query("insert into public.events (story_id, kind, visitor, at) values ($1, 'save', 'old', now())", [s]);
    await db.query("insert into public.saves (visitor, story_id) values ('old', $1)", [s]);
    await attach(U1, "old");
    const [c] = await calls("user_id = $1", [U1]);
    assert.deepEqual([c.source, c.scored, c.flags, c.keepers_before, c.position], ["migrated", false, ["reconstructed"], 1, 2]);
  });

  test("history follows the account to another browser", async () => {
    await user(U1);
    const s = await live();
    await keep(s, "laptop", U1);
    await attach(U1, "phone");
    const m = await me(U1);
    assert.equal(m.list.length, 1);
    assert.equal(m.list[0].id, s);
    assert.equal(m.status, "building");
    assert.ok(!("score" in m), "the raw score never leaves the database");
  });
});

describe("verdicts", () => {
  test("an Early Call: kept early, and the story broke out before it ended", async () => {
    await user(U1);
    await user(U2);
    const s = await live();
    await keep(s, "me", U1);
    for (let i = 0; i < 18; i++) await keep(s, "k" + i);
    await keep(s, "late", U2);
    for (let i = 18; i < 29; i++) await keep(s, "k" + i);
    await settle();
    assert.equal((await calls("user_id = $1", [U1]))[0].breakout, "grew", "a breakout is seen while the story is live");
    assert.equal((await calls("user_id = $1", [U1]))[0].early, null, "the verdict waits for the end");
    await end(s);
    await settle();
    const [mine] = await calls("user_id = $1", [U1]);
    const [late] = await calls("user_id = $1", [U2]);
    assert.deepEqual([mine.final_keepers, mine.early], [31, true]);
    assert.equal(late.early, false, "#20 of 31 is not in the first 20%");
    assert.ok(mine.settled_at && late.settled_at);
  });

  test("becoming a Hotspot after your call is a breakout; one before it isn't", async () => {
    await user(U1);
    const s = await live();
    await keep(s, "me", U1);
    await user(U2);
    const t = await live(2);
    await db.query("update public.stories set hot_at = now() where id = $1", [t]);
    await keep(t, "late", U2);
    /* s becomes a Hotspot a minute after the call; t already was one when it was kept */
    await db.query(
      "update public.stories set hot_at = (select called_at from public.scout_calls where story_id = $1) + interval '1 minute' where id = $1",
      [s],
    );
    await settle();
    await end(s);
    await end(t);
    await settle();
    const [mine] = await calls("user_id = $1", [U1]);
    const [late] = await calls("user_id = $1", [U2]);
    assert.deepEqual([mine.breakout, mine.early], ["hotspot", true]);
    assert.deepEqual([late.was_hot, late.breakout, late.early], [true, null, false]);
  });
});

describe("reputation and tiers", () => {
  /** n eligible Scouts, each with 10 settled counted calls; the first `early` of each hit. */
  async function population(n, { hitsFor = () => 1 } = {}) {
    const stories = [];
    for (let i = 1; i <= 10; i++) stories.push(await live(i));
    for (let u = 0; u < n; u++) {
      const id = `00000000-0000-4000-8000-${String(1000 + u).padStart(12, "0")}`;
      await user(id);
      await db.query("insert into public.scout_profiles (user_id, scout_since) values ($1, now() - interval '8 days')", [id]);
      const hits = hitsFor(u);
      for (let k = 0; k < 10; k++)
        await db.query(
          `insert into public.scout_calls (user_id, visitor, story_id, lane, source, keepers_before, position, opens, exposed, was_hot, story_age_min, scored,
                                           breakout, final_keepers, early, settled_at)
           values ($1, $2, $3, 'music', 'signed_in', $4, $4 + 1, 1, 1, false, 1, true, 'grew', 100, $5, now())`,
          [id, "v" + u, stories[k], k < hits ? u % 20 : 50, k < hits],
        );
    }
  }
  const recalc = async () => (await one("select public.scout_recalc($1) r", [KEY])).r;
  const tiers = async () =>
    Object.fromEntries((await db.query("select coalesce(tier, 'none') t, count(*)::int n from public.scout_profiles group by 1")).rows.map((r) => [r.t, r.n]));

  test("below 200 eligible Scouts nobody gets a tier or a percentile", async () => {
    await population(199);
    assert.deepEqual(await recalc(), { scouts: 199, eligible: 199 });
    assert.deepEqual(await tiers(), { none: 199 });
    assert.equal((await one("select count(*)::int n from public.scout_profiles where percentile is not null")).n, 0);
  });

  test("at 200: Gold top 3%, Silver 10%, Bronze 25%, and a tier move is recorded", async () => {
    await population(200);
    await recalc();
    const t = await tiers();
    /* 20 distinct positions, 10 Scouts each: ties share the better place */
    assert.equal(t.gold, 10, "the 10 Scouts at #1 all have nobody above them");
    assert.equal(t.gold + (t.silver ?? 0) + (t.bronze ?? 0) <= 60, true);
    assert.equal((await one("select count(*)::int n from public.scout_moves")).n, 200 - t.none);
    const top = await one("select user_id from public.scout_profiles where tier = 'gold' limit 1");
    const m = await me(top.user_id);
    assert.equal(m.status, "gold");
    assert.equal(m.percentile, 1);
    /* again: nothing changed, no new moves */
    await recalc();
    assert.equal((await one("select count(*)::int n from public.scout_moves")).n, 200 - t.none);
  });

  test("no Early Call, no tier; a browser shared by two accounts makes neither eligible", async () => {
    await population(200, { hitsFor: (u) => (u === 0 ? 0 : 1) });
    const [a, b] = ["00000000-0000-4000-8000-000000001001", "00000000-0000-4000-8000-000000001002"];
    await db.query("insert into public.scout_devices (user_id, visitor) values ($1, 'shared'), ($2, 'shared')", [a, b]);
    await recalc();
    const first = await one("select tier, eligible from public.scout_profiles where user_id = '00000000-0000-4000-8000-000000001000'");
    assert.equal(first.tier, null, "no Early Call");
    for (const u of [a, b]) assert.deepEqual(await one("select tier, eligible from public.scout_profiles where user_id = $1", [u]), { tier: null, eligible: false });
  });

  test("letting go of a call doesn't change the record", async () => {
    await population(1);
    const before = (await one("select score from public.scout_profiles")).score;
    await recalc();
    const s1 = (await one("select score from public.scout_profiles")).score;
    await db.query("update public.scout_calls set hidden_at = now()");
    await recalc();
    assert.equal((await one("select score from public.scout_profiles")).score, s1);
    assert.notEqual(before, s1);
  });
});

describe("sharing", () => {
  test("private until shared, by a chosen name, never the email; a link can be replaced or switched off", async () => {
    await user(U1, "private@example.com");
    const s = await live();
    await keep(s, "me", U1);
    assert.equal((await one("select public.scout_public('nope') r")).r, null);
    const slug = (await one("select public.scout_share($1, $2, true, 'Martijn') r", [KEY, U1])).r;
    assert.match(slug, /^[a-z0-9]{16}$/);
    const card = (await one("select public.scout_public($1) r", [slug])).r;
    assert.equal(card.name, "Martijn");
    assert.ok(!JSON.stringify(card).includes("private@example.com"));
    assert.ok(!JSON.stringify(card).includes(U1));
    const again = (await one("select public.scout_share($1, $2, true, null, true) r", [KEY, U1])).r;
    assert.notEqual(again, slug);
    assert.equal((await one("select public.scout_public($1) r", [slug])).r, null, "the old link stops working");
    assert.equal((await one("select public.scout_share($1, $2, false) r", [KEY, U1])).r, null);
    assert.equal((await one("select public.scout_public($1) r", [again])).r, null);
  });

  test("a single call is shareable only when it was an Early Call", async () => {
    await user(U1);
    const s = await live();
    await keep(s, "me", U1);
    const slug = (await one("select public.scout_share($1, $2, true) r", [KEY, U1])).r;
    const storySlug = (await one("select slug from public.stories where id = $1", [s])).slug;
    assert.equal((await one("select public.scout_call_public($1, $2) r", [slug, storySlug])).r, null);
    for (let i = 0; i < 29; i++) await keep(s, "k" + i);
    await end(s);
    await settle();
    const c = (await one("select public.scout_call_public($1, $2) r", [slug, storySlug])).r;
    assert.equal(c.scout, "A Fivehundrd Scout");
    assert.deepEqual([c.position, c.keepersThen, c.keepersNow], [1, 0, 30]);
  });

  test("only the server key reads or changes a Scout", async () => {
    await user(U1);
    await assert.rejects(one("select public.scout_me('wrong', $1)", [U1]), /forbidden/);
    await assert.rejects(one("select public.scout_share('wrong', $1, true)", [U1]), /forbidden/);
    await assert.rejects(one("select public.scout_attach('wrong', $1, 'v')", [U1]), /forbidden/);
    await assert.rejects(one("select public.scout_recalc('wrong')"), /forbidden/);
  });
});

describe("today on Fivehundrd", () => {
  test("real counts for the day: distinct visitors, and opens once per visitor and story", async () => {
    const s = await live();
    assert.deepEqual(pick((await one("select public.today_public() r")).r), { visitors: 0, opened: 0 });
    await db.query("insert into public.visits (visitor, is_new) values ('a', true), ('a', false), ('b', true)");
    await event(s, "open", "a");
    await event(s, "open", "a");
    await event(s, "open", "b");
    /* yesterday doesn't count */
    await db.query("insert into public.visits (visitor, is_new, at) values ('c', true, now() - interval '2 days')");
    assert.deepEqual(pick((await one("select public.today_public() r")).r), { visitors: 2, opened: 2 });
  });
});
const pick = (r) => ({ visitors: Number(r.visitors), opened: Number(r.opened) });
