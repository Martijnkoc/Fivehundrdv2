/*
 * Hotspots: one address can't pose as a crowd (audit, 2026-10-01).
 *
 * Visitor ids are made by the browser, so a script that keeps making new ones
 * could push a story up the list. Two limits, both in private.hotspot_cfg():
 *  - per story, one address (the salted IP hash) counts as at most `perIp`
 *    people: the first ones it brought. A household or an office still counts
 *    as a few people; a script on one connection counts as those few too.
 *  - the maker's address (the one that reserved the spot) doesn't count at
 *    all, like the maker's own browser already didn't.
 * And record_event takes at most `ipPerHour` events an hour from one address.
 * More visitors means more exposure, which only lowers a score, so exposure
 * stays everyone.
 */

create or replace function private.hotspot_cfg() returns jsonb
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
    'listed', 30,          -- how many the wall gets (it filters per lane)
    'perIp', 3,            -- at most this many people per address and story
    'ipPerHour', 1500      -- events an hour one address may record
  )
$$;
revoke all on function private.hotspot_cfg() from public, anon, authenticated;

create index events_ip_hash_at_idx on public.events (ip_hash, at) where ip_hash is not null;

create or replace function public.record_event(p_key text, p_story uuid, p_kind text, p_visitor text, p_ip_hash text, p_user uuid default null)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_id bigint; v_n int; v_at timestamptz;
begin
  perform private.assert_server(p_key);
  if (select count(*) from public.events where visitor = p_visitor and at > now() - interval '1 hour') >= 300 then
    return false;
  end if;
  if p_ip_hash is not null and (select count(*) from public.events where ip_hash = p_ip_hash and at > now() - interval '1 hour')
       >= (private.hotspot_cfg() ->> 'ipPerHour')::int then
    return false;
  end if;
  if not exists (select 1 from public.stories where id = p_story and starts_at is not null
                   and hidden_at is null and removed_at is null) then
    return false;
  end if;
  if p_kind = 'save' then
    insert into public.saves (visitor, story_id, user_id) values (p_visitor, p_story, p_user) on conflict do nothing;
    if not found then return false; end if;
    /* this locks the story row: Timehearts on one story are recorded one at a time */
    update public.stories set saves = saves + 1 where id = p_story;
    v_at := clock_timestamp();
    perform private.scout_record(p_user, p_visitor, p_story, v_at);
  elsif p_kind = 'unsave' then
    update public.scout_calls set hidden_at = now()
     where story_id = p_story and hidden_at is null and (visitor = p_visitor or (p_user is not null and user_id = p_user));
    with d as (
      delete from public.saves
       where story_id = p_story and (visitor = p_visitor or (p_user is not null and user_id = p_user))
      returning 1)
    select count(*) into v_n from d;
    if v_n = 0 then return false; end if;
    update public.stories set saves = greatest(0, saves - v_n) where id = p_story;
  end if;
  insert into public.events (story_id, kind, visitor, ip_hash, at)
  values (p_story, p_kind, p_visitor, p_ip_hash, coalesce(v_at, now()))
  on conflict do nothing
  returning id into v_id;
  if v_id is not null and p_kind = 'open' then
    update public.stories set opens = opens + 1 where id = p_story;
  end if;
  return v_id is not null;
end $$;

create or replace function private.refresh_hotspots() returns void
language plpgsql security definer set search_path = '' as $$
declare
  cfg jsonb := private.hotspot_cfg();
  since timestamptz := now() - make_interval(hours => (cfg ->> 'windowHours')::int);
begin
  with live as (
    select st.id, st.visitor as maker, st.ip_hash as maker_ip from public.stories st join public.spots sp on sp.story_id = st.id
     where sp.status = 'live' and st.ends_at > now() and st.hidden_at is null and st.removed_at is null
  ),
  /* the maker's own opens, saves and shares don't count toward their spot, from their browser or their address */
  recent as (
    select e.story_id, e.visitor, e.kind, e.ip_hash, e.at from public.events e join live l on l.id = e.story_id
     where e.at > since and e.visitor is distinct from l.maker
       and (l.maker_ip is null or e.ip_hash is distinct from l.maker_ip)
  ),
  /* one address is at most perIp people per story: the first it brought (no address: the visitor alone) */
  firsts as (
    select story_id, visitor, coalesce(ip_hash, 'v:' || visitor) as addr, min(at) as first_at
      from recent group by story_id, visitor, coalesce(ip_hash, 'v:' || visitor)
  ),
  people as (
    select story_id, visitor, addr from (
      select f.*, row_number() over (partition by story_id, addr order by first_at, visitor) as n from firsts f
    ) f where n <= (cfg ->> 'perIp')::int
  ),
  act as (
    select r.story_id,
           count(distinct r.visitor) filter (where r.kind = 'open') as o,
           count(distinct r.visitor) filter (where r.kind = 'link_click') as c,
           count(distinct r.visitor) filter (where r.kind = 'save') as s,
           count(distinct r.visitor) filter (where r.kind = 'share') as sh
      /* only what a person did from the address they count for */
      from recent r join people p on p.story_id = r.story_id and p.visitor = r.visitor
                                 and p.addr = coalesce(r.ip_hash, 'v:' || r.visitor)
     group by r.story_id
  ),
  /* everyone exposed in the window: saw the tile, or did anything with the story */
  exposed as (
    select story_id, count(distinct visitor) as n from (
      select i.story_id, i.visitor from public.impressions i join live l on l.id = i.story_id
       where i.at > since and i.visitor is distinct from l.maker
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
