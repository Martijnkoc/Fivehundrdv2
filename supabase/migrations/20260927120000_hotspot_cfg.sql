/*
 * Hotspots, tunable and measured per exposure (docs/retention.md).
 *
 * The weights are a hypothesis, not a finding: chosen by hand before there
 * was any Fivehundrd traffic. They live in private.hotspot_cfg() so they can
 * be changed from real data (which early signal best predicts what people
 * keep, click through to and share) without touching the formula.
 *
 * Exposure (the denominator) is now everyone who saw the tile OR did
 * anything with the story in the window. Before, it was only tiles seen on
 * the wall in the window, so two things inflated scores: a visitor who saw
 * the tile this morning (impressions are one row per visitor and day, at the
 * first sighting) and saved it tonight, and opens from the Hotspots band
 * itself, which shows tiles outside the wall and records no impressions,
 * so being a Hotspot fed the score that kept it one.
 */

create function private.hotspot_cfg() returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'windowHours', 6,      -- recent activity only: "moving now", not lifetime popularity
    'wOpen', 1,            -- weights per person (hypothesis; tune from data)
    'wClick', 3,
    'wSave', 4,
    'wShare', 4,
    'prior', 20,           -- added to exposure, so a handful of people can't top the list
    'minPeople', 3,        -- at least this many actions from distinct people
    'halfLifeHours', 6,    -- once in the top 5, the score halves this often
    'top', 5,              -- what counts as "a Hotspot" (stories.hot_at)
    'listed', 30           -- how many the wall gets (it filters per lane)
  )
$$;
revoke all on function private.hotspot_cfg() from public, anon, authenticated;

create or replace function private.refresh_hotspots() returns void
language plpgsql security definer set search_path = '' as $$
declare
  cfg jsonb := private.hotspot_cfg();
  since timestamptz := now() - make_interval(hours => (cfg ->> 'windowHours')::int);
begin
  with live as (
    select st.id from public.stories st join public.spots sp on sp.story_id = st.id
     where sp.status = 'live' and st.ends_at > now() and st.hidden_at is null and st.removed_at is null
  ),
  recent as (
    select e.story_id, e.visitor, e.kind from public.events e
     where e.at > since and e.story_id in (select id from live)
  ),
  act as (
    select story_id,
           count(distinct visitor) filter (where kind = 'open') as o,
           count(distinct visitor) filter (where kind = 'link_click') as c,
           count(distinct visitor) filter (where kind = 'save') as s,
           count(distinct visitor) filter (where kind = 'share') as sh
      from recent group by story_id
  ),
  /* everyone exposed in the window: saw the tile, or did anything with the story */
  exposed as (
    select story_id, count(distinct visitor) as n from (
      select i.story_id, i.visitor from public.impressions i where i.at > since and i.story_id in (select id from live)
      union
      select story_id, visitor from recent
    ) x group by story_id
  ),
  scored as (
    select a.story_id, a.o, a.c, a.s, a.sh,
           ((a.o * (cfg ->> 'wOpen')::real + a.c * (cfg ->> 'wClick')::real + a.s * (cfg ->> 'wSave')::real + a.sh * (cfg ->> 'wShare')::real)
              / sqrt(coalesce(x.n, 0) + (cfg ->> 'prior')::real))
             * case when h.top_at is null then 1
                    else power(0.5, extract(epoch from now() - h.top_at) / (3600 * (cfg ->> 'halfLifeHours')::real)) end as score
      from act a
      left join exposed x on x.story_id = a.story_id
      left join public.hotspots h on h.story_id = a.story_id
     where a.o + a.c + a.s + a.sh >= (cfg ->> 'minPeople')::int
  ),
  ranked as (select *, row_number() over (order by score desc, story_id) as rk from scored)
  insert into public.hotspots as h (story_id, score, rank, opens, clicks, saves, shares, top_at, updated_at)
  select story_id, score, case when rk <= (cfg ->> 'listed')::int then rk end, o, c, s, sh,
         case when rk <= (cfg ->> 'top')::int then now() end, now()
    from ranked
  on conflict (story_id) do update set
    score = excluded.score, rank = excluded.rank, opens = excluded.opens, clicks = excluded.clicks, saves = excluded.saves,
    shares = excluded.shares, top_at = coalesce(h.top_at, excluded.top_at), updated_at = now();

  /* the first time in the top 5, for good */
  update public.stories st set hot_at = h.top_at
    from public.hotspots h where h.story_id = st.id and h.top_at is not null and st.hot_at is null;

  /* no activity any more, or no longer live: out of the list (a spot keeps its top_at while it's live) */
  update public.hotspots h set rank = null, score = 0
   where h.updated_at < now() - interval '1 minute' and h.rank is not null;
  delete from public.hotspots h
   where not exists (select 1 from public.spots sp where sp.story_id = h.story_id and sp.status = 'live');

  perform private.settle_calls();
end $$;
