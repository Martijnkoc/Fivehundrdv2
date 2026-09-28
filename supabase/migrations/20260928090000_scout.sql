/*
 * Scout (docs/scout.md): reputation for taste, for signed-in visitors.
 *
 * A Timeheart is a call. Every Timeheart gets a snapshot of the story at that
 * moment (who had kept it before, how many had opened or seen it, whether it
 * was already a Hotspot), frozen for good: nothing is reconstructed later
 * from current numbers. Calls made while signed in can count toward a
 * private reputation; anonymous calls are history only, and become the
 * account's history (never its reputation) when the visitor signs in.
 *
 * Nothing here feeds the Hotspot score or any public counter. Percentiles
 * and tiers only exist above a minimum population of eligible Scouts.
 * Thresholds: private.scout_cfg().
 */

-- ------------------------------------------------------------ settings ---

create function private.scout_cfg() returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    -- Early Call: kept before its breakout, within the first 20% of its keepers ...
    'earlyShare', 0.20,
    -- ... and it broke out: became a Hotspot, or reached 25 keepers and 3x your position
    'breakMin', 25,
    'breakFactor', 3,
    -- a call's value: growth factor capped, Hotspot bonus
    'growthCap', 6,
    'hotBonus', 1.5,
    -- the smoothed hit rate: (early + 1) / (settled + 5)
    'prior', 5,
    -- who is eligible for a percentile
    'minSettled', 10,
    'minAccountDays', 7,
    -- tiers exist only with at least this many eligible Scouts
    'minPopulation', 200,
    'gold', 0.03,
    'silver', 0.10,
    'bronze', 0.25,
    -- anti-gaming
    'dailyScored', 20,
    'burstPerMinute', 10,
    'accountsPerIp', 3,
    -- after signing in from a Timeheart, that one Timeheart can still count
    'promptMinutes', 30
  )
$$;
revoke all on function private.scout_cfg() from public, anon, authenticated;

-- -------------------------------------------------------------- tables ---

/* one row per signed-in Scout: the shareable card and the latest reputation */
create table public.scout_profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) between 1 and 40),
  share_slug   text unique,
  share_on     boolean not null default false,
  scout_since  timestamptz not null default now(),
  -- the nightly reputation (private.scout_recalc); never shown as a number
  score        real not null default 0,
  settled      integer not null default 0,
  early        integer not null default 0,
  hotspots     integer not null default 0,
  eligible     boolean not null default false,
  population   integer not null default 0,
  higher       integer,
  percentile   smallint,
  tier         text check (tier in ('gold', 'silver', 'bronze')),
  computed_at  timestamptz
);

/*
 * A Timeheart as a call. The snapshot columns never change after insert
 * (trigger below). One row per visitor and story, and one per account and
 * story: the first Timeheart is the call, keeping it again doesn't reset it.
 */
create table public.scout_calls (
  id             bigint generated always as identity primary key,
  user_id        uuid references auth.users (id) on delete cascade,
  visitor        text not null,
  story_id       uuid not null references public.stories (id) on delete cascade,
  lane           text not null,
  called_at      timestamptz not null default now(),
  -- 'signed_in': made while signed in; 'anonymous': not (yet) an account's;
  -- 'migrated': made before signing in, now the account's history
  source         text not null check (source in ('signed_in', 'anonymous', 'migrated')),
  -- the story at that moment, distinct people, without its maker
  keepers_before integer not null,
  position       integer not null,
  opens          integer not null,
  exposed        integer not null,
  was_hot        boolean not null,
  hot_rank       smallint,
  story_age_min  integer not null,
  -- counts toward reputation; flags say why not (daily_cap, burst, own, no_open, reconstructed)
  scored         boolean not null,
  flags          text[] not null default '{}',
  -- the outcome (private.settle_scout)
  breakout       text check (breakout in ('hotspot', 'grew')),
  breakout_at    timestamptz,
  final_keepers  integer,
  early          boolean,
  settled_at     timestamptz,
  -- let go of (Timeheart undone): gone from the list, still part of the record
  hidden_at      timestamptz
);
create unique index scout_calls_visitor_story_key on public.scout_calls (visitor, story_id);
create unique index scout_calls_user_story_key on public.scout_calls (user_id, story_id) where user_id is not null;
create index scout_calls_story_idx on public.scout_calls (story_id);
create index scout_calls_open_idx on public.scout_calls (story_id) where settled_at is null;
create index scout_calls_user_idx on public.scout_calls (user_id, called_at) where user_id is not null;

/* which browsers an account has used, for multi-account checks */
create table public.scout_devices (
  user_id  uuid not null references auth.users (id) on delete cascade,
  visitor  text not null,
  first_at timestamptz not null default now(),
  primary key (user_id, visitor)
);
create index scout_devices_visitor_idx on public.scout_devices (visitor);

/* tier changes, for the moment on the card (only ever shown to that Scout) */
create table public.scout_moves (
  id        bigint generated always as identity primary key,
  user_id   uuid not null references auth.users (id) on delete cascade,
  from_tier text,
  to_tier   text,
  percentile smallint,
  at        timestamptz not null default now()
);
create index scout_moves_user_idx on public.scout_moves (user_id, at);

alter table public.scout_profiles enable row level security;
alter table public.scout_calls    enable row level security;
alter table public.scout_devices  enable row level security;
alter table public.scout_moves    enable row level security;
revoke all on public.scout_profiles, public.scout_calls, public.scout_devices, public.scout_moves from public, anon, authenticated;

/* the proof can't be rewritten: snapshot columns are fixed once written */
create function private.scout_calls_frozen() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.visitor is distinct from old.visitor or new.story_id is distinct from old.story_id
     or new.lane is distinct from old.lane or new.called_at is distinct from old.called_at
     or new.keepers_before is distinct from old.keepers_before or new.position is distinct from old.position
     or new.opens is distinct from old.opens or new.exposed is distinct from old.exposed
     or new.was_hot is distinct from old.was_hot or new.hot_rank is distinct from old.hot_rank
     or new.story_age_min is distinct from old.story_age_min then
    raise exception 'a Scout call''s snapshot is fixed' using errcode = '42501';
  end if;
  /* an account is set once; a call only leaves 'anonymous' */
  if old.user_id is not null and new.user_id is distinct from old.user_id then
    raise exception 'a Scout call''s account is fixed' using errcode = '42501';
  end if;
  if new.source is distinct from old.source and old.source <> 'anonymous' then
    raise exception 'a Scout call''s source is fixed' using errcode = '42501';
  end if;
  /* a call can stop counting, and only an anonymous one can start */
  if new.scored and not old.scored and old.source <> 'anonymous' then
    raise exception 'a Scout call can''t start counting' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger scout_calls_frozen before update on public.scout_calls
  for each row execute function private.scout_calls_frozen();

-- ------------------------------------------------------------- calling ---

/** Distinct people who kept a story before a moment, without its maker. */
create function private.keepers(p_story uuid, p_before timestamptz) returns integer
language sql stable set search_path = '' as $$
  select count(distinct e.visitor)::int from public.events e join public.stories st on st.id = e.story_id
   where e.story_id = p_story and e.kind = 'save' and e.at <= p_before and e.visitor is distinct from st.visitor
$$;

/** Why a new call can't count toward reputation (empty: it can). */
create function private.scout_flags(p_user uuid, p_visitor text, p_story uuid, p_at timestamptz) returns text[]
language plpgsql stable set search_path = '' as $$
declare
  cfg jsonb := private.scout_cfg();
  st public.stories;
  f text[] := '{}';
begin
  select * into st from public.stories where id = p_story;
  if st.visitor = p_visitor
     or (st.maker_email is not null and lower(st.maker_email) = (select lower(email) from auth.users where id = p_user)) then
    f := array_append(f, 'own');
  end if;
  if (select count(*) from public.scout_calls where user_id = p_user and scored
        and called_at >= date_trunc('day', p_at at time zone 'UTC') at time zone 'UTC')
       >= (cfg ->> 'dailyScored')::int then
    f := array_append(f, 'daily_cap');
  end if;
  if (select count(*) from public.scout_calls where (user_id = p_user or visitor = p_visitor)
        and called_at > p_at - interval '1 minute') >= (cfg ->> 'burstPerMinute')::int then
    f := array_append(f, 'burst');
  end if;
  if not exists (select 1 from public.events where story_id = p_story and visitor = p_visitor and kind = 'open' and at <= p_at) then
    f := array_append(f, 'no_open');
  end if;
  return f;
end $$;

/**
 * A Timeheart becomes a call (called from record_event, before the save's
 * own event, so the snapshot is everyone before this visitor). Only on a live
 * story; the first one per visitor, and per account, stands.
 */
create function private.scout_record(p_user uuid, p_visitor text, p_story uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  st public.stories;
  h public.hotspots;
  f text[];
  k integer;
begin
  select st2.* into st from public.stories st2 join public.spots sp on sp.story_id = st2.id
   where st2.id = p_story and sp.status = 'live' and st2.ends_at > now()
     and st2.hidden_at is null and st2.removed_at is null;
  if not found then return; end if;
  /* keeping it again: the first call stands, it's only back in the list */
  update public.scout_calls set hidden_at = null
   where story_id = p_story and (visitor = p_visitor or (p_user is not null and user_id = p_user));
  if found then return; end if;
  if p_user is not null then
    insert into public.scout_devices (user_id, visitor) values (p_user, p_visitor) on conflict do nothing;
    f := private.scout_flags(p_user, p_visitor, p_story, now());
  else
    f := '{}';
  end if;
  select * into h from public.hotspots where story_id = p_story;
  k := private.keepers(p_story, now());
  insert into public.scout_calls (user_id, visitor, story_id, lane, source, keepers_before, position, opens, exposed,
                                  was_hot, hot_rank, story_age_min, scored, flags)
  values (p_user, p_visitor, p_story, st.lane, case when p_user is null then 'anonymous' else 'signed_in' end,
          k, k + 1,
          private.people(p_story, 'open', now()),
          (select count(distinct visitor)::int from public.impressions where story_id = p_story),
          st.hot_at is not null, h.rank,
          greatest(0, floor(extract(epoch from now() - st.starts_at) / 60))::int,
          p_user is not null and cardinality(f) = 0, f)
  on conflict do nothing;
  if p_user is not null then
    insert into public.scout_profiles (user_id) values (p_user) on conflict do nothing;
  end if;
end $$;

/**
 * As before (opens once a day, saves per visitor, limits, hidden stories not
 * counted), plus Scout: a save is a call, made by the account when the
 * server has checked the visitor is signed in (p_user). Letting go hides the
 * call; it stays part of the record.
 */
drop function public.record_event(text, uuid, text, text, text);
create function public.record_event(p_key text, p_story uuid, p_kind text, p_visitor text, p_ip_hash text, p_user uuid default null)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  perform private.assert_server(p_key);
  if (select count(*) from public.events where visitor = p_visitor and at > now() - interval '1 hour') >= 300 then
    return false;
  end if;
  if not exists (select 1 from public.stories where id = p_story and starts_at is not null
                   and hidden_at is null and removed_at is null) then
    return false;
  end if;
  if p_kind = 'save' then
    insert into public.saves (visitor, story_id, user_id) values (p_visitor, p_story, p_user) on conflict do nothing;
    if not found then return false; end if;
    update public.stories set saves = saves + 1 where id = p_story;
    perform private.scout_record(p_user, p_visitor, p_story);
  elsif p_kind = 'unsave' then
    delete from public.saves where visitor = p_visitor and story_id = p_story;
    if not found then return false; end if;
    update public.stories set saves = greatest(0, saves - 1) where id = p_story;
    update public.scout_calls set hidden_at = now()
     where story_id = p_story and hidden_at is null and (visitor = p_visitor or (p_user is not null and user_id = p_user));
  end if;
  insert into public.events (story_id, kind, visitor, ip_hash)
  values (p_story, p_kind, p_visitor, p_ip_hash)
  on conflict do nothing
  returning id into v_id;
  if v_id is not null and p_kind = 'open' then
    update public.stories set opens = opens + 1 where id = p_story;
  end if;
  return v_id is not null;
end $$;

-- ------------------------------------------------------------- signing in ---

/**
 * A visitor signs in: this browser's calls become the account's history.
 * Anonymous calls count as 'migrated' and never toward reputation, with one
 * exception: the Timeheart that led to signing in (p_story), made in the last
 * promptMinutes on a live story, counts as if made signed in (with the same
 * checks). Saves from before calls existed get a history row reconstructed
 * from the event log (server times only), flagged and never counted. The
 * account's own calls always win over a browser's duplicate.
 */
create function public.scout_attach(p_key text, p_user uuid, p_visitor text, p_story uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  cfg jsonb := private.scout_cfg();
  c public.scout_calls;
  f text[];
  n_migrated integer := 0;
  n_counted integer := 0;
  n_rebuilt integer := 0;
begin
  perform private.assert_server(p_key);
  insert into public.scout_profiles (user_id) values (p_user) on conflict do nothing;
  insert into public.scout_devices (user_id, visitor) values (p_user, p_visitor) on conflict do nothing;
  update public.saves set user_id = p_user where visitor = p_visitor and user_id is null;

  /* the account already called it (on another browser): that call stands */
  delete from public.scout_calls a
   where a.visitor = p_visitor and a.user_id is null
     and exists (select 1 from public.scout_calls b where b.user_id = p_user and b.story_id = a.story_id);

  for c in select * from public.scout_calls where visitor = p_visitor and user_id is null order by called_at loop
    if c.story_id = p_story and c.called_at > now() - make_interval(mins => (cfg ->> 'promptMinutes')::int)
       and exists (select 1 from public.stories st where st.id = c.story_id and st.ends_at > now()
                     and st.hidden_at is null and st.removed_at is null) then
      f := private.scout_flags(p_user, p_visitor, c.story_id, now());
      update public.scout_calls set user_id = p_user, source = 'signed_in', scored = cardinality(f) = 0, flags = f
       where id = c.id;
      n_counted := n_counted + 1;
    else
      update public.scout_calls set user_id = p_user, source = 'migrated', scored = false where id = c.id;
      n_migrated := n_migrated + 1;
    end if;
  end loop;

  /* saves this browser made before a call was recorded with them */
  with firsts as (
    select e.story_id, min(e.at) as at from public.events e
     where e.visitor = p_visitor and e.kind = 'save'
       and exists (select 1 from public.saves s where s.visitor = p_visitor and s.story_id = e.story_id)
       and not exists (select 1 from public.scout_calls x where x.story_id = e.story_id and (x.user_id = p_user or x.visitor = p_visitor))
     group by e.story_id
  ),
  rebuilt as (
    insert into public.scout_calls (user_id, visitor, story_id, lane, called_at, source, keepers_before, position,
                                    opens, exposed, was_hot, hot_rank, story_age_min, scored, flags)
    select p_user, p_visitor, f.story_id, st.lane, f.at, 'migrated',
           k.n, k.n + 1,
           (select count(distinct e.visitor)::int from public.events e where e.story_id = f.story_id and e.kind = 'open' and e.at <= f.at),
           (select count(distinct i.visitor)::int from public.impressions i where i.story_id = f.story_id and i.at <= f.at),
           st.hot_at is not null and st.hot_at <= f.at, null,
           greatest(0, floor(extract(epoch from f.at - st.starts_at) / 60))::int,
           false, array['reconstructed']
      from firsts f join public.stories st on st.id = f.story_id
      cross join lateral (select count(distinct e.visitor)::int as n from public.events e
                           where e.story_id = f.story_id and e.kind = 'save' and e.at < f.at
                             and e.visitor <> p_visitor and e.visitor is distinct from st.visitor) k
     where st.starts_at is not null
    on conflict do nothing
    returning 1
  )
  select count(*) into n_rebuilt from rebuilt;

  return jsonb_build_object('migrated', n_migrated + n_rebuilt, 'counted', n_counted);
end $$;

-- --------------------------------------------------------------- outcomes ---

/**
 * Breakouts while a story is live (for "something you Scouted is moving"),
 * and the verdict when it ends: final keepers and whether the call was an
 * Early Call. Runs with Hotspots, every 10 minutes (via settle_calls).
 */
create function private.settle_scout() returns void
language plpgsql security definer set search_path = '' as $$
declare cfg jsonb := private.scout_cfg();
begin
  with open_calls as (
    select c.id, c.called_at, c.position, c.was_hot, st.hot_at, st.ends_at,
           (st.ends_at <= now() or st.removed_at is not null or st.hidden_at is not null) as over,
           private.keepers(c.story_id, least(now(), st.ends_at)) as keepers
      from public.scout_calls c join public.stories st on st.id = c.story_id
     where c.settled_at is null
  ),
  judged as (
    select o.*,
           case
             when not o.was_hot and o.hot_at is not null and o.hot_at > o.called_at and o.hot_at <= o.ends_at then 'hotspot'
             when o.keepers >= (cfg ->> 'breakMin')::int and o.keepers >= (cfg ->> 'breakFactor')::int * o.position then 'grew'
           end as b
      from open_calls o
  )
  update public.scout_calls c set
    breakout = coalesce(case when c.breakout = 'hotspot' then 'hotspot' end, j.b, c.breakout),
    breakout_at = case
      when j.b = 'hotspot' and c.breakout is distinct from 'hotspot' then j.hot_at
      when c.breakout is null and j.b is not null then now()
      else c.breakout_at end,
    final_keepers = case when j.over then j.keepers end,
    early = case when j.over then
      not j.was_hot and coalesce(case when c.breakout = 'hotspot' then 'hotspot' end, j.b, c.breakout) is not null
      and j.position <= ceil((cfg ->> 'earlyShare')::numeric * j.keepers) end,
    settled_at = case when j.over then now() end
  from judged j
  where c.id = j.id;
end $$;

/* Hotspots already settle the calls every 10 minutes; they settle Scout calls too. */
create or replace function private.settle_calls() returns void
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
  perform private.settle_scout();
end $$;

-- ------------------------------------------------------------- reputation ---

/**
 * One call's worth (lib/wall/scout.ts, callValue, is the same formula):
 * nothing unless it was an Early Call; then how early (1 for the first
 * keeper) × how much it grew after you (log2, capped) × 1.5 if it became a
 * Hotspot.
 */
create function private.scout_value(p_early boolean, p_position integer, p_before integer, p_final integer, p_breakout text)
returns double precision
language sql immutable set search_path = '' as $$
  select case when not coalesce(p_early, false) or coalesce(p_final, 0) <= 0 then 0::double precision else
    (1 - (p_position - 1)::double precision / p_final)
    * least((private.scout_cfg() ->> 'growthCap')::double precision, log(2, 1 + p_final::numeric / greatest(1, p_before))::double precision)
    * case when p_breakout = 'hotspot' then (private.scout_cfg() ->> 'hotBonus')::double precision else 1 end
  end
$$;

/**
 * Nightly: every Scout's reputation, who is eligible, the percentile among
 * them and the tier. score = Σ value × (early + 1) / (settled + prior), over
 * settled calls that count. Eligible: minSettled counted calls, an account
 * minAccountDays old, and no sign of multiple accounts (a browser shared with
 * another account, or more than accountsPerIp accounts on one address in 30
 * days). Tiers only with minPopulation eligible Scouts, and only with an
 * Early Call. Tier changes are recorded for the card's moment.
 */
create function public.scout_recalc(p_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  cfg jsonb := private.scout_cfg();
  n integer;
begin
  perform private.assert_server(p_key);
  drop table if exists scout_now;
  create temporary table scout_now on commit drop as
  with calls as (
    select user_id,
           count(*) filter (where settled_at is not null) as settled,
           count(*) filter (where settled_at is not null and early) as early,
           count(*) filter (where settled_at is not null and early and breakout = 'hotspot') as hotspots,
           coalesce(sum(private.scout_value(early, position, keepers_before, final_keepers, breakout))
                    filter (where settled_at is not null), 0) as value
      from public.scout_calls where user_id is not null and scored
     group by user_id
  ),
  shared_browser as (
    select distinct d.user_id from public.scout_devices d
     where exists (select 1 from public.scout_devices o where o.visitor = d.visitor and o.user_id <> d.user_id)
  ),
  shared_ip as (
    select distinct d.user_id from public.scout_devices d
      join public.events e on e.visitor = d.visitor and e.at > now() - interval '30 days' and e.ip_hash is not null
     where e.ip_hash in (
       select e2.ip_hash from public.events e2 join public.scout_devices d2 on d2.visitor = e2.visitor
        where e2.at > now() - interval '30 days' and e2.ip_hash is not null
        group by e2.ip_hash having count(distinct d2.user_id) > (cfg ->> 'accountsPerIp')::int)
  )
  select p.user_id,
         coalesce(c.settled, 0)::int as settled, coalesce(c.early, 0)::int as early, coalesce(c.hotspots, 0)::int as hotspots,
         (coalesce(c.value, 0) * (coalesce(c.early, 0) + 1) / (coalesce(c.settled, 0) + (cfg ->> 'prior')::int))::real as score,
         (coalesce(c.settled, 0) >= (cfg ->> 'minSettled')::int
          and p.scout_since <= now() - make_interval(days => (cfg ->> 'minAccountDays')::int)
          and p.user_id not in (select user_id from shared_browser)
          and p.user_id not in (select user_id from shared_ip)) as eligible,
         p.tier as old_tier
    from public.scout_profiles p left join calls c on c.user_id = p.user_id;

  select count(*) into n from scout_now where eligible;

  update public.scout_profiles p set
    score = s.score, settled = s.settled, early = s.early, hotspots = s.hotspots, eligible = s.eligible,
    population = n,
    higher = case when s.eligible then (select count(*)::int from scout_now o where o.eligible and o.score > s.score) end,
    percentile = case when s.eligible and n >= (cfg ->> 'minPopulation')::int then
      ceil(((select count(*) from scout_now o where o.eligible and o.score > s.score) + 1)::numeric / n * 100)::smallint end,
    tier = case when s.eligible and n >= (cfg ->> 'minPopulation')::int and s.early >= 1 then
      private.scout_tier((select count(*)::int from scout_now o where o.eligible and o.score > s.score), n) end,
    computed_at = now()
  from scout_now s where s.user_id = p.user_id;

  insert into public.scout_moves (user_id, from_tier, to_tier, percentile)
  select p.user_id, s.old_tier, p.tier, p.percentile
    from public.scout_profiles p join scout_now s on s.user_id = p.user_id
   where p.tier is distinct from s.old_tier;

  return jsonb_build_object('scouts', (select count(*) from scout_now), 'eligible', n);
end $$;

/** The tier for `higher` Scouts with a better score among `n` eligible (lib/wall/scout.ts, tierFor). */
create function private.scout_tier(p_higher integer, p_n integer) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_higher + 1 <= floor((private.scout_cfg() ->> 'gold')::numeric * p_n) then 'gold'
    when p_higher + 1 <= floor((private.scout_cfg() ->> 'silver')::numeric * p_n) then 'silver'
    when p_higher + 1 <= floor((private.scout_cfg() ->> 'bronze')::numeric * p_n) then 'bronze'
  end
$$;

-- ---------------------------------------------------------------- reading ---

/** A call as the Scout sees it, with its story. */
create function private.scout_call_json(c public.scout_calls) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', st.id, 'lane', st.lane, 'no', st.spot_no, 'name', st.name, 'slug', st.slug,
    'artwork', st.artwork_key, 'logo', st.logo_key, 'seed', st.seed, 'pal', st.pal,
    'startsAt', st.starts_at, 'endsAt', st.ends_at,
    'gone', st.ends_at <= now() or st.hidden_at is not null or st.removed_at is not null,
    'calledAt', c.called_at, 'source', c.source, 'scored', c.scored,
    'position', c.position, 'keepersThen', c.keepers_before, 'keepersNow', st.saves, 'wasHot', c.was_hot,
    'breakout', c.breakout, 'breakoutAt', c.breakout_at, 'finalKeepers', c.final_keepers,
    'early', c.early, 'settled', c.settled_at is not null, 'hidden', c.hidden_at is not null)
  from public.stories st where st.id = c.story_id
$$;

/**
 * The signed-in Scout's own card and calls. `status`: 'building' until
 * minSettled counted calls, then 'scout', or a tier once tiers are active.
 * The raw score never leaves the database.
 */
create function public.scout_me(p_key text, p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  cfg jsonb := private.scout_cfg();
  p public.scout_profiles;
  best public.scout_calls;
begin
  perform private.assert_server(p_key);
  select * into p from public.scout_profiles where user_id = p_user;
  if not found then return null; end if;
  select * into best from public.scout_calls c
   where c.user_id = p_user and c.scored and c.early
   order by private.scout_value(c.early, c.position, c.keepers_before, c.final_keepers, c.breakout) desc, c.called_at
   limit 1;
  return jsonb_build_object(
    'name', p.display_name,
    'since', p.scout_since,
    'share', case when p.share_on then p.share_slug end,
    'status', case when p.tier is not null then p.tier
                   when p.settled >= (cfg ->> 'minSettled')::int then 'scout' else 'building' end,
    'percentile', case when p.tier is not null then p.percentile end,
    'calls', (select count(*) from public.scout_calls where user_id = p_user and hidden_at is null),
    'early', (select count(*) from public.scout_calls where user_id = p_user and scored and early),
    'hotspots', (select count(*) from public.scout_calls where user_id = p_user and scored and early and breakout = 'hotspot'),
    'settled', (select count(*) from public.scout_calls where user_id = p_user and scored and settled_at is not null),
    'minSettled', (cfg ->> 'minSettled')::int,
    'best', case when best.id is not null then private.scout_call_json(best) end,
    'moves', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'from', m.from_tier, 'to', m.to_tier, 'percentile', m.percentile, 'at', m.at) order by m.at desc)
                         from (select * from public.scout_moves where user_id = p_user order by at desc limit 5) m), '[]'::jsonb),
    'list', coalesce((select jsonb_agg(private.scout_call_json(c) order by c.called_at desc)
                        from (select * from public.scout_calls where user_id = p_user and hidden_at is null order by called_at desc limit 500) c), '[]'::jsonb)
  );
end $$;

-- ---------------------------------------------------------------- sharing ---

/**
 * The Scout Card is private until its Scout shares it: a name of their
 * choosing (never their email) and a random link, which they can switch off
 * or replace. Returns the link's slug, or null when sharing is off.
 */
create function public.scout_share(p_key text, p_user uuid, p_on boolean, p_name text default null, p_new_link boolean default false)
returns text
language plpgsql security definer set search_path = '' as $$
declare v text;
begin
  perform private.assert_server(p_key);
  insert into public.scout_profiles (user_id) values (p_user) on conflict do nothing;
  update public.scout_profiles set
    display_name = coalesce(nullif(left(trim(p_name), 40), ''), display_name),
    share_on = p_on,
    share_slug = case when p_on and (share_slug is null or p_new_link) then private.new_slug() || private.new_slug() else share_slug end
  where user_id = p_user
  returning case when share_on then share_slug end into v;
  return v;
end $$;

/** A shared Scout Card: only what the card shows, only while its Scout shares it. */
create function public.scout_public(p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'name', coalesce(p.display_name, 'A Fivehundrd Scout'),
    'since', p.scout_since,
    'tier', p.tier,
    'percentile', case when p.tier is not null then p.percentile end,
    'calls', (select count(*) from public.scout_calls where user_id = p.user_id and hidden_at is null),
    'early', (select count(*) from public.scout_calls where user_id = p.user_id and scored and early),
    'hotspots', (select count(*) from public.scout_calls where user_id = p.user_id and scored and early and breakout = 'hotspot'),
    'best', (select jsonb_build_object('name', st.name, 'lane', st.lane, 'no', st.spot_no, 'slug', st.slug,
                                       'artwork', st.artwork_key, 'logo', st.logo_key, 'seed', st.seed, 'pal', st.pal,
                                       'position', c.position, 'keepersThen', c.keepers_before,
                                       'keepersNow', coalesce(c.final_keepers, st.saves), 'hotspot', c.breakout = 'hotspot')
               from public.scout_calls c join public.stories st on st.id = c.story_id
              where c.user_id = p.user_id and c.scored and c.early and st.hidden_at is null and st.removed_at is null
              order by private.scout_value(c.early, c.position, c.keepers_before, c.final_keepers, c.breakout) desc, c.called_at
              limit 1))
    from public.scout_profiles p
   where p.share_slug = p_slug and p.share_on
$$;

/** One shared call: only an Early Call, only while its Scout shares their card. */
create function public.scout_call_public(p_slug text, p_story_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'scout', coalesce(p.display_name, 'A Fivehundrd Scout'),
    'tier', p.tier,
    'percentile', case when p.tier is not null then p.percentile end,
    'name', st.name, 'lane', st.lane, 'no', st.spot_no, 'slug', st.slug,
    'artwork', st.artwork_key, 'logo', st.logo_key, 'seed', st.seed, 'pal', st.pal,
    'position', c.position, 'keepersThen', c.keepers_before,
    'keepersNow', coalesce(c.final_keepers, st.saves), 'hotspot', c.breakout = 'hotspot', 'calledAt', c.called_at)
    from public.scout_profiles p
    join public.scout_calls c on c.user_id = p.user_id and c.scored and c.early
    join public.stories st on st.id = c.story_id and st.slug = p_story_slug and st.hidden_at is null and st.removed_at is null
   where p.share_slug = p_slug and p.share_on
$$;

-- ----------------------------------------------------------------- grants ---

revoke all on function private.keepers(uuid, timestamptz), private.scout_flags(uuid, text, uuid, timestamptz),
  private.scout_record(uuid, text, uuid), private.settle_scout(), private.scout_calls_frozen(),
  private.scout_value(boolean, integer, integer, integer, text), private.scout_tier(integer, integer),
  private.scout_call_json(public.scout_calls)
  from public, anon, authenticated;
revoke all on function public.record_event(text, uuid, text, text, text, uuid), public.scout_attach(text, uuid, text, uuid),
  public.scout_recalc(text), public.scout_me(text, uuid), public.scout_share(text, uuid, boolean, text, boolean),
  public.scout_public(text), public.scout_call_public(text, text)
  from public, anon, authenticated;
-- server functions: callable, but useless without the server key
grant execute on function public.record_event(text, uuid, text, text, text, uuid), public.scout_attach(text, uuid, text, uuid),
  public.scout_recalc(text), public.scout_me(text, uuid), public.scout_share(text, uuid, boolean, text, boolean)
  to anon;
-- a shared card and a shared call, by their link
grant execute on function public.scout_public(text), public.scout_call_public(text, text) to anon, authenticated;

-- -------------------------------------------------------------- measuring ---

/* the Scout loop (docs/scout.md, Metrics) */
alter table public.track drop constraint track_kind_check;
alter table public.track add constraint track_kind_check
  check (kind in ('create_start', 'create_step', 'client_error', 'since_shown', 'since_tap', 'hot_tap', 'new_tap',
                  'scout_prompt_shown', 'scout_prompt_tap', 'scout_signed_in', 'scout_card_view', 'scout_card_share',
                  'scout_call_share', 'scout_move_seen', 'scout_breakout_seen'));

create or replace function public.track_surface(p_key text, p_visitor text, p_kind text, p_story uuid default null, p_props jsonb default null)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_server(p_key);
  if p_kind not in ('since_shown', 'since_tap', 'hot_tap', 'new_tap',
                    'scout_prompt_shown', 'scout_prompt_tap', 'scout_signed_in', 'scout_card_view', 'scout_card_share',
                    'scout_call_share', 'scout_move_seen', 'scout_breakout_seen') then
    return false;
  end if;
  if (select count(*) from public.track where visitor = p_visitor and at > now() - interval '1 hour') >= 200 then
    return false;
  end if;
  insert into public.track (visitor, kind, story_id, props)
  values (left(p_visitor, 64), p_kind, (select id from public.stories where id = p_story), p_props);
  return true;
end $$;

/**
 * The Control Room's Scout questions over a period: the sign-in prompt and
 * how often it converts, Scouts made, calls per Scout, Early Calls, cards
 * viewed and shared, and whether Scouts come back more than other visitors
 * (D1, D7, D30 after their first visit in the period).
 */
create function public.fd_scout(p_key text, p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_server(p_key);
  return jsonb_build_object(
    'promptShown', (select count(*) from public.track where kind = 'scout_prompt_shown' and at >= p_from and at < p_to),
    'promptTaps', (select count(*) from public.track where kind = 'scout_prompt_tap' and at >= p_from and at < p_to),
    'signedIn', (select count(*) from public.track where kind = 'scout_signed_in' and at >= p_from and at < p_to),
    'newScouts', (select count(*) from public.scout_profiles where scout_since >= p_from and scout_since < p_to),
    'calls', (select count(*) from public.scout_calls where user_id is not null and called_at >= p_from and called_at < p_to),
    'scouts', (select count(distinct user_id) from public.scout_calls where user_id is not null and called_at >= p_from and called_at < p_to),
    'early', (select count(*) from public.scout_calls where scored and early and settled_at >= p_from and settled_at < p_to),
    'cardViews', (select count(*) from public.track where kind = 'scout_card_view' and at >= p_from and at < p_to),
    'cardShares', (select count(*) from public.track where kind = 'scout_card_share' and at >= p_from and at < p_to),
    'callShares', (select count(*) from public.track where kind = 'scout_call_share' and at >= p_from and at < p_to),
    'breakoutReturns', (select count(*) from public.track where kind = 'scout_breakout_seen' and at >= p_from and at < p_to),
    'moveReturns', (select count(*) from public.track where kind = 'scout_move_seen' and at >= p_from and at < p_to),
    'returns', (
      with fresh as (
        select v.visitor, v.first_at, exists (select 1 from public.scout_devices d where d.visitor = v.visitor) as scout
          from public.visitors v
         where v.first_at >= p_from and v.first_at < least(p_to, now() - interval '1 day')
      ),
      back as (
        select f.scout,
               exists (select 1 from public.visits x where x.visitor = f.visitor and x.at >= f.first_at + interval '1 day' and x.at < f.first_at + interval '2 days') as d1,
               case when f.first_at < now() - interval '8 days' then
                 exists (select 1 from public.visits x where x.visitor = f.visitor and x.at >= f.first_at + interval '7 days' and x.at < f.first_at + interval '8 days') end as d7,
               case when f.first_at < now() - interval '31 days' then
                 exists (select 1 from public.visits x where x.visitor = f.visitor and x.at >= f.first_at + interval '30 days' and x.at < f.first_at + interval '31 days') end as d30
          from fresh f
      )
      select jsonb_build_object(
        'scouts', count(*) filter (where scout), 'others', count(*) filter (where not scout),
        'scoutsD1', avg(d1::int) filter (where scout), 'othersD1', avg(d1::int) filter (where not scout),
        'scoutsD7', avg(d7::int) filter (where scout), 'othersD7', avg(d7::int) filter (where not scout),
        'scoutsD30', avg(d30::int) filter (where scout), 'othersD30', avg(d30::int) filter (where not scout))
        from back)
  );
end $$;

revoke all on function public.fd_scout(text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.fd_scout(text, timestamptz, timestamptz) to anon;
