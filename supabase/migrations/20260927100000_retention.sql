/*
 * Retention (docs/retention.md): the data behind "since your last visit",
 * provenance in Finds and Call it. Everything is derived from the immutable
 * events (opens, saves, shares, link clicks, impressions) except two things
 * that can't be reconstructed later:
 *
 *   stories.hot_at  when a story first entered the top 5 of Hotspots. The
 *                   hotspots table forgets a story when its spot ends.
 *   calls           a visitor's private prediction ("this one will move"),
 *                   with the story's state frozen at that moment. Raw
 *                   impressions get rolled up over time and the Hotspot
 *                   formula can change, so the snapshot is kept as it was.
 *
 * Calls never feed anything public: not the Hotspot score, not a counter.
 * The thresholds live in private.retention_cfg(), to tune from real data.
 */

-- ------------------------------------------------------------ settings ---

create function private.retention_cfg() returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    -- Found Early: among the first 10% of a story's savers ...
    'earlyShare', 0.10,
    -- ... of a story that reached at least 20 savers ...
    'earlyMinSavers', 20,
    -- ... and, while it is still live, only once it has grown 3x since you saved
    'earlyGrowth', 3,
    -- Call it: a call "moved" when savers after it reach 2x the savers before it, and at least 15
    'moveFactor', 2,
    'moveMin', 15,
    -- calls per visitor per (UTC) day
    'callsPerDay', 3
  )
$$;

-- ------------------------------------------------------------- hotspots ---

alter table public.stories add column hot_at timestamptz;
alter table public.hotspots add column shares integer not null default 0;
update public.stories st set hot_at = h.top_at from public.hotspots h where h.story_id = st.id and h.top_at is not null;

/*
 * As before, now with shares (weighted like a save): per person over the last
 * 6 hours, (opens + 3 × link clicks + 4 × saves + 4 × shares) / sqrt(impressions + 20).
 * A story's first entry into the top 5 is kept on the story (hot_at).
 */
create or replace function private.refresh_hotspots() returns void
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
           count(distinct e.visitor) filter (where e.kind = 'save') as s,
           count(distinct e.visitor) filter (where e.kind = 'share') as sh
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
    select a.story_id, a.o, a.c, a.s, a.sh,
           ((a.o + 3 * a.c + 4 * a.s + 4 * a.sh)::real / sqrt(coalesce(i.n, 0) + 20))
             * case when h.top_at is null then 1 else power(0.5, extract(epoch from now() - h.top_at) / 21600) end as score
      from act a
      left join imp i on i.story_id = a.story_id
      left join public.hotspots h on h.story_id = a.story_id
     where a.o + a.c + a.s + a.sh >= 3
  ),
  ranked as (select *, row_number() over (order by score desc, story_id) as rk from scored)
  insert into public.hotspots as h (story_id, score, rank, opens, clicks, saves, shares, top_at, updated_at)
  select story_id, score, case when rk <= 30 then rk end, o, c, s, sh, case when rk <= 5 then now() end, now() from ranked
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

-- ---------------------------------------------------------------- calls ---

create table public.calls (
  visitor     text not null,
  story_id    uuid not null references public.stories (id) on delete cascade,
  lane        text not null,
  called_at   timestamptz not null default now(),
  -- the story at the moment of the call (distinct people so far)
  impressions integer not null,
  opens       integer not null,
  saves       integer not null,
  shares      integer not null,
  clicks      integer not null,
  score       real,
  rank        smallint,
  was_hot     boolean not null,
  -- derived, by private.settle_calls(): 'hotspot' (became one after the call) or 'moved'
  outcome     text check (outcome in ('hotspot', 'moved')),
  outcome_at  timestamptz,
  savers_after integer,
  settled_at  timestamptz,
  primary key (visitor, story_id)
);
create index calls_story_idx on public.calls (story_id);
create index calls_called_at_idx on public.calls (called_at);
create index calls_open_idx on public.calls (story_id) where settled_at is null;
alter table public.calls enable row level security;
revoke all on public.calls from public, anon, authenticated;

/** Distinct people who did `kind` on a story before a moment. */
create function private.people(p_story uuid, p_kind text, p_before timestamptz) returns integer
language sql stable set search_path = '' as $$
  select count(distinct visitor)::int from public.events where story_id = p_story and kind = p_kind and at <= p_before
$$;

/**
 * Call it: one call per visitor and story, three a day, only on a live story
 * that isn't the visitor's own and hasn't been a Hotspot. Calling also keeps
 * it (a save), taken after the snapshot so the call's own save isn't in it.
 * Calling again returns the first call unchanged: the moment can't be reset.
 */
create function public.call_story(p_key text, p_visitor text, p_story uuid, p_ip_hash text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  st public.stories;
  c public.calls;
  h public.hotspots;
  n integer;
  cap integer := (private.retention_cfg() ->> 'callsPerDay')::int;
begin
  perform private.assert_server(p_key);
  select * into c from public.calls where visitor = p_visitor and story_id = p_story;
  if found then
    return jsonb_build_object('status', 'called', 'calledAt', c.called_at);
  end if;
  select st2.* into st from public.stories st2 join public.spots sp on sp.story_id = st2.id
   where st2.id = p_story and sp.status = 'live' and st2.ends_at > now()
     and st2.hidden_at is null and st2.removed_at is null;
  if not found then return jsonb_build_object('status', 'unavailable'); end if;
  if st.visitor = p_visitor then return jsonb_build_object('status', 'own'); end if;
  if st.hot_at is not null then return jsonb_build_object('status', 'hot'); end if;
  select count(*) into n from public.calls
   where visitor = p_visitor and called_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  if n >= cap then return jsonb_build_object('status', 'limit'); end if;
  select * into h from public.hotspots where story_id = p_story;
  insert into public.calls (visitor, story_id, lane, impressions, opens, saves, shares, clicks, score, rank, was_hot)
  values (p_visitor, p_story, st.lane,
          (select count(distinct visitor)::int from public.impressions where story_id = p_story),
          private.people(p_story, 'open', now()), private.people(p_story, 'save', now()),
          private.people(p_story, 'share', now()), private.people(p_story, 'link_click', now()),
          h.score, h.rank, false)
  on conflict do nothing
  returning * into c;
  if c.visitor is null then
    select * into c from public.calls where visitor = p_visitor and story_id = p_story;
    return jsonb_build_object('status', 'called', 'calledAt', c.called_at);
  end if;
  perform public.record_event(p_key, p_story, 'save', p_visitor, p_ip_hash);
  return jsonb_build_object('status', 'called', 'calledAt', c.called_at, 'left', cap - n - 1);
end $$;

/**
 * Whether calls came true, until their story ends: 'hotspot' when it entered
 * the top 5 after the call; 'moved' when the people who saved it after the
 * call reach moveFactor x those before it, and at least moveMin. A 'moved'
 * call still becomes 'hotspot' if that happens later. Runs with Hotspots.
 */
create function private.settle_calls() returns void
language plpgsql security definer set search_path = '' as $$
declare cfg jsonb := private.retention_cfg();
begin
  with open_calls as (
    select c.visitor, c.story_id, c.called_at, c.saves, st.hot_at, st.ends_at,
           (st.ends_at <= now() or st.removed_at is not null or st.hidden_at is not null) as over,
           (select count(distinct e.visitor)::int from public.events e
             where e.story_id = c.story_id and e.kind = 'save' and e.at > c.called_at and e.at <= least(now(), st.ends_at)
               and e.visitor <> c.visitor
               and not exists (select 1 from public.events e0 where e0.story_id = c.story_id and e0.kind = 'save'
                                 and e0.visitor = e.visitor and e0.at <= c.called_at)) as after
      from public.calls c join public.stories st on st.id = c.story_id
     where c.settled_at is null and not c.was_hot
  )
  update public.calls c set
    savers_after = o.after,
    outcome = case
      when o.hot_at is not null and o.hot_at > o.called_at and o.hot_at <= o.ends_at then 'hotspot'
      when c.outcome is not null then c.outcome
      when o.after >= greatest((cfg ->> 'moveMin')::int, (cfg ->> 'moveFactor')::numeric * o.saves) then 'moved'
    end,
    outcome_at = case
      when o.hot_at is not null and o.hot_at > o.called_at and o.hot_at <= o.ends_at then o.hot_at
      when c.outcome is not null then c.outcome_at
      when o.after >= greatest((cfg ->> 'moveMin')::int, (cfg ->> 'moveFactor')::numeric * o.saves) then now()
    end,
    settled_at = case when o.over then now() end
  from open_calls o
  where c.visitor = o.visitor and c.story_id = o.story_id;
end $$;

-- ---------------------------------------------------------------- Finds ---

/** Who made a story, for "the maker is back": their email, or the browser that paid. Never leaves the database. */
create function private.maker_key(p_email text, p_visitor text) returns text
language sql immutable set search_path = '' as $$
  select coalesce('e:' || lower(nullif(trim(p_email), '')), 'v:' || nullif(p_visitor, ''))
$$;

/**
 * A visitor's Finds, with their history: when they saved each story and how
 * many people had by then, how many keep it now, whether they found it early,
 * their call and how it went, and whether its maker is back on the wall.
 * Only for stories this visitor saved or called.
 */
create function public.finds_status(p_key text, p_visitor text, p_stories uuid[]) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare cfg jsonb := private.retention_cfg();
begin
  perform private.assert_server(p_key);
  return coalesce((
    with mine as (
      select st.*, (select min(e.at) from public.events e where e.story_id = st.id and e.kind = 'save' and e.visitor = p_visitor) as saved_at
        from public.stories st
       where st.id = any (p_stories[1:200]) and st.starts_at is not null
    ),
    firsts as (
      select e.story_id, e.visitor, min(e.at) as at
        from public.events e where e.kind = 'save' and e.story_id in (select id from mine)
       group by e.story_id, e.visitor
    ),
    ranked as (
      select m.id,
             (select count(*)::int from firsts f where f.story_id = m.id and f.at <= m.saved_at) as rank,
             (select count(*)::int from firsts f where f.story_id = m.id) as savers
        from mine m
    )
    select jsonb_agg(jsonb_build_object(
      'id', m.id,
      'savedAt', m.saved_at,
      'rank', r.rank,
      'savers', r.savers,
      'saves', m.saves,
      'hotAt', m.hot_at,
      'endsAt', m.ends_at,
      'gone', m.ends_at <= now() or m.hidden_at is not null or m.removed_at is not null,
      'early', m.saved_at is not null and (
        (m.hot_at is not null and m.saved_at < m.hot_at)
        or (r.savers >= (cfg ->> 'earlyMinSavers')::int
            and (r.rank - 0.5) / nullif(r.savers, 0) <= (cfg ->> 'earlyShare')::numeric
            and (m.ends_at <= now() or r.savers >= (cfg ->> 'earlyGrowth')::int * r.rank))),
      'call', (select jsonb_build_object('calledAt', c.called_at, 'outcome', c.outcome, 'outcomeAt', c.outcome_at, 'savesThen', c.saves)
                 from public.calls c where c.visitor = p_visitor and c.story_id = m.id),
      'back', (select jsonb_build_object('id', b.id, 'lane', b.lane, 'no', b.spot_no, 'slug', b.slug, 'name', b.name)
                 from public.stories b join public.spots sp on sp.story_id = b.id and sp.status = 'live'
                where b.id <> m.id and b.starts_at > m.starts_at and b.ends_at > now()
                  and b.hidden_at is null and b.removed_at is null
                  and private.maker_key(b.maker_email, b.visitor) = private.maker_key(m.maker_email, m.visitor)
                order by b.starts_at desc limit 1)
    ))
      from mine m join ranked r on r.id = m.id
     where m.saved_at is not null or exists (select 1 from public.calls c where c.visitor = p_visitor and c.story_id = m.id)
  ), '[]'::jsonb);
end $$;

-- ------------------------------------------------------------ measuring ---

/* what the band above the wall showed, and taps on it (props: item, holdout) */
alter table public.track drop constraint track_kind_check;
alter table public.track add constraint track_kind_check
  check (kind in ('create_start', 'create_step', 'client_error', 'since_shown', 'since_tap', 'hot_tap', 'new_tap'));

/** The band above the wall: what it showed (once a visit) and taps on it. */
create function public.track_surface(p_key text, p_visitor text, p_kind text, p_story uuid default null, p_props jsonb default null)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_server(p_key);
  if p_kind not in ('since_shown', 'since_tap', 'hot_tap', 'new_tap') then return false; end if;
  if (select count(*) from public.track where visitor = p_visitor and at > now() - interval '1 hour') >= 200 then
    return false;
  end if;
  insert into public.track (visitor, kind, story_id, props)
  values (left(p_visitor, 64), p_kind, (select id from public.stories where id = p_story), p_props);
  return true;
end $$;

/**
 * The Control Room's retention questions, over a period:
 *   calls: made, by how many people, how many came true, and how long before a Hotspot;
 *   found early: of the savers of stories that ended in the period, how many were early;
 *   since your last visit: shown, tapped, and opens in the 30 minutes after, against the 10% who don't see it;
 *   Hotspots and Newest: taps, and saves and shares of the tapped story in the 30 minutes after;
 *   who comes back: 7-day return of new visitors who saved (or called) on their first day, and who didn't.
 */
create function public.fd_retention(p_key text, p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare cfg jsonb := private.retention_cfg();
begin
  perform private.assert_server(p_key);
  return jsonb_build_object(
    'calls', (
      select jsonb_build_object(
        'made', count(*),
        'callers', count(distinct visitor),
        'settled', count(*) filter (where settled_at is not null),
        'hotspot', count(*) filter (where outcome = 'hotspot'),
        'moved', count(*) filter (where outcome = 'moved'),
        'hoursToHotspot', percentile_cont(0.5) within group (order by extract(epoch from outcome_at - called_at) / 3600)
                            filter (where outcome = 'hotspot'))
        from public.calls where called_at >= p_from and called_at < p_to),
    'early', (
      with ended as (
        select id, hot_at from public.stories where ends_at >= p_from and ends_at < p_to and ends_at <= now()
      ),
      firsts as (
        select e.story_id, e.visitor, min(e.at) as at from public.events e
         where e.kind = 'save' and e.story_id in (select id from ended) group by e.story_id, e.visitor
      ),
      ranked as (
        select f.*, n.hot_at, row_number() over (partition by f.story_id order by f.at) as rk,
               count(*) over (partition by f.story_id) as savers
          from firsts f join ended n on n.id = f.story_id
      )
      select jsonb_build_object(
        'saves', count(*),
        'early', count(*) filter (where (hot_at is not null and at < hot_at)
                   or (savers >= (cfg ->> 'earlyMinSavers')::int and (rk - 0.5) / savers <= (cfg ->> 'earlyShare')::numeric)))
        from ranked),
    'since', (
      with shown as (
        select t.visitor, t.at, coalesce((t.props ->> 'holdout')::boolean, false) as holdout
          from public.track t where t.kind = 'since_shown' and t.at >= p_from and t.at < p_to
      ),
      depth as (
        select s.holdout,
               (select count(*) from public.events e where e.visitor = s.visitor and e.kind = 'open'
                  and e.at >= s.at and e.at < s.at + interval '30 minutes') as opens,
               exists (select 1 from public.visits v where v.visitor = s.visitor
                  and v.at > s.at + interval '30 minutes' and v.at < s.at + interval '7 days') as back
          from shown s
      )
      select jsonb_build_object(
        'shown', count(*) filter (where not holdout),
        'holdout', count(*) filter (where holdout),
        'taps', (select count(*) from public.track where kind = 'since_tap' and at >= p_from and at < p_to),
        'opensShown', avg(opens) filter (where not holdout),
        'opensHoldout', avg(opens) filter (where holdout),
        'backShown', avg(back::int) filter (where not holdout),
        'backHoldout', avg(back::int) filter (where holdout))
        from depth),
    'taps', (
      with taps as (
        select t.kind, t.visitor, t.story_id, t.at from public.track t
         where t.kind in ('hot_tap', 'new_tap') and t.at >= p_from and t.at < p_to and t.story_id is not null
      )
      select jsonb_build_object(
        'hot', count(*) filter (where kind = 'hot_tap'),
        'new', count(*) filter (where kind = 'new_tap'),
        'hotKept', count(*) filter (where kind = 'hot_tap' and exists (select 1 from public.events e where e.visitor = taps.visitor
                     and e.story_id = taps.story_id and e.kind in ('save', 'share') and e.at >= taps.at and e.at < taps.at + interval '30 minutes')),
        'newKept', count(*) filter (where kind = 'new_tap' and exists (select 1 from public.events e where e.visitor = taps.visitor
                     and e.story_id = taps.story_id and e.kind in ('save', 'share') and e.at >= taps.at and e.at < taps.at + interval '30 minutes')),
        /* the wall as a whole: opens followed by a save or share of the same story */
        'wallOpens', (select count(*) from public.events where kind = 'open' and at >= p_from and at < p_to),
        'wallKept', (select count(*) from public.events o where o.kind = 'open' and o.at >= p_from and o.at < p_to
                       and exists (select 1 from public.events e where e.visitor = o.visitor and e.story_id = o.story_id
                         and e.kind in ('save', 'share') and e.at >= o.at and e.at < o.at + interval '30 minutes')))
        from taps),
    'returns', (
      with fresh as (
        select v.visitor, v.first_at,
               exists (select 1 from public.events e where e.visitor = v.visitor and e.kind = 'save'
                         and e.at < v.first_at + interval '1 day') as saved,
               exists (select 1 from public.calls c where c.visitor = v.visitor and c.called_at < v.first_at + interval '1 day') as called,
               exists (select 1 from public.visits x where x.visitor = v.visitor
                         and x.at >= v.first_at + interval '1 day' and x.at < v.first_at + interval '8 days') as back
          from public.visitors v
         where v.first_at >= p_from and v.first_at < least(p_to, now() - interval '8 days')
      )
      select jsonb_build_object(
        'visitors', count(*),
        'saved', count(*) filter (where saved), 'savedBack', count(*) filter (where saved and back),
        'notSaved', count(*) filter (where not saved), 'notSavedBack', count(*) filter (where not saved and back),
        'called', count(*) filter (where called), 'calledBack', count(*) filter (where called and back),
        'notCalled', count(*) filter (where not called), 'notCalledBack', count(*) filter (where not called and back))
        from fresh)
  );
end $$;

-- --------------------------------------------------------------- grants ---

revoke all on function private.retention_cfg(), private.people(uuid, text, timestamptz), private.settle_calls(),
  private.maker_key(text, text) from public, anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array[
    'call_story(text, text, uuid, text)', 'finds_status(text, text, uuid[])',
    'track_surface(text, text, text, uuid, jsonb)',
    'fd_retention(text, timestamptz, timestamptz)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    -- callable, but useless without the server key
    execute format('grant execute on function public.%s to anon', f);
  end loop;
end $$;
