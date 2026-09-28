/*
 * Hotspots: the spots with traction right now, above the wall.
 *
 * Every 10 minutes, for live stories only, over the last 6 hours:
 *   (people who opened + 3 × people who clicked through to the maker
 *    + 4 × people who saved) / sqrt(impressions + 20)
 * Per person, so repeat clicks don't count; per exposure, so a spot that
 * joined two hours ago can beat one that has been seen all weekend; at least
 * 3 people, so one visitor can't make a hotspot. Once a spot has been in the
 * top 5, its score halves every 6 hours from that moment, so the spotlight
 * moves on and every maker can get their turn.
 */
create table public.hotspots (
  story_id   uuid primary key references public.stories (id) on delete cascade,
  score      real not null,
  rank       smallint,
  opens      integer not null default 0,
  clicks     integer not null default 0,
  saves      integer not null default 0,
  top_at     timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.hotspots enable row level security;
revoke all on public.hotspots from public, anon, authenticated;

create function private.refresh_hotspots() returns void
language plpgsql security definer set search_path = '' as $$
begin
  with live as (
    select st.id from public.stories st join public.spots sp on sp.story_id = st.id
     where sp.status = 'live' and st.ends_at > now() and st.hidden_at is null and st.removed_at is null
  ),
  act as (
    select e.story_id,
           count(distinct e.visitor) filter (where e.kind = 'open') as o,
           count(distinct e.visitor) filter (where e.kind = 'link_click') as c,
           count(distinct e.visitor) filter (where e.kind = 'save') as s
      from public.events e
     where e.at > now() - interval '6 hours' and e.story_id in (select id from live)
     group by e.story_id
  ),
  imp as (
    select i.story_id, count(*) as n from public.impressions i
     where i.at > now() - interval '6 hours' and i.story_id in (select id from live)
     group by i.story_id
  ),
  scored as (
    select a.story_id, a.o, a.c, a.s,
           ((a.o + 3 * a.c + 4 * a.s)::real / sqrt(coalesce(i.n, 0) + 20))
             * case when h.top_at is null then 1 else power(0.5, extract(epoch from now() - h.top_at) / 21600) end as score
      from act a
      left join imp i on i.story_id = a.story_id
      left join public.hotspots h on h.story_id = a.story_id
     where a.o + a.c + a.s >= 3
  ),
  ranked as (select *, row_number() over (order by score desc, story_id) as rk from scored)
  insert into public.hotspots as h (story_id, score, rank, opens, clicks, saves, top_at, updated_at)
  select story_id, score, case when rk <= 30 then rk end, o, c, s, case when rk <= 5 then now() end, now() from ranked
  on conflict (story_id) do update set
    score = excluded.score, rank = excluded.rank, opens = excluded.opens, clicks = excluded.clicks, saves = excluded.saves,
    top_at = coalesce(h.top_at, excluded.top_at), updated_at = now();

  /* no activity any more, or no longer live: out of the list (a spot keeps its top_at while it's live) */
  update public.hotspots h set rank = null, score = 0
   where h.updated_at < now() - interval '1 minute' and h.rank is not null;
  delete from public.hotspots h
   where not exists (select 1 from public.spots sp where sp.story_id = h.story_id and sp.status = 'live');
end $$;

/** The current top 30 (the wall filters by lane and shows 5). Public: only ids and counts. */
create function public.hot_public() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', story_id, 'rank', rank, 'opens', opens, 'clicks', clicks, 'saves', saves) order by rank), '[]'::jsonb)
    from public.hotspots where rank is not null
$$;

revoke all on function private.refresh_hotspots() from public, anon, authenticated;
revoke all on function public.hot_public() from public, anon, authenticated;
grant execute on function public.hot_public() to anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('fivehundrd-hotspots', '*/10 * * * *', 'select private.refresh_hotspots()');
  end if;
end $$;
