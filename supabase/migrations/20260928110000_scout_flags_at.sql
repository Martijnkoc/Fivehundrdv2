/*
 * Scout: a call is judged at its own moment (review fix, docs/scout.md).
 *
 * - The checks (own, daily_cap, burst, no_open) are made at the call's
 *   called_at, also when signing in makes the prompting Timeheart count
 *   (scout_attach used the login moment).
 * - Burst and the daily cap count only calls that could count themselves
 *   (made signed in), never this browser's anonymous or migrated history,
 *   and never the call being judged.
 * - One timestamp per Timeheart: record_event takes the clock once, after the
 *   story row is locked (its saves update), and the call, its snapshot and the
 *   save event all use it. The snapshot counts every save already committed,
 *   so two Timehearts at the same moment can't share a position.
 */

drop function private.scout_flags(uuid, text, uuid, timestamptz);
create function private.scout_flags(p_user uuid, p_visitor text, p_story uuid, p_at timestamptz, p_self bigint default null)
returns text[]
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
  if (select count(*) from public.scout_calls where user_id = p_user and scored and id is distinct from p_self
        and called_at >= date_trunc('day', p_at at time zone 'UTC') at time zone 'UTC' and called_at <= p_at)
       >= (cfg ->> 'dailyScored')::int then
    f := array_append(f, 'daily_cap');
  end if;
  /* signed-in calls only: by this account, or by another account on this browser */
  if (select count(*) from public.scout_calls where source = 'signed_in' and id is distinct from p_self
        and (user_id = p_user or (visitor = p_visitor and user_id is not null))
        and called_at > p_at - interval '1 minute' and called_at <= p_at)
       >= (cfg ->> 'burstPerMinute')::int then
    f := array_append(f, 'burst');
  end if;
  if not exists (select 1 from public.events where story_id = p_story and visitor = p_visitor and kind = 'open' and at <= p_at) then
    f := array_append(f, 'no_open');
  end if;
  return f;
end $$;

drop function private.scout_record(uuid, text, uuid);
create function private.scout_record(p_user uuid, p_visitor text, p_story uuid, p_at timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
declare
  st public.stories;
  h public.hotspots;
  f text[];
  k integer;
begin
  select st2.* into st from public.stories st2 join public.spots sp on sp.story_id = st2.id
   where st2.id = p_story and sp.status = 'live' and st2.ends_at > p_at
     and st2.hidden_at is null and st2.removed_at is null;
  if not found then return; end if;
  /* keeping it again: the first call stands, it's only back in the list */
  update public.scout_calls set hidden_at = null
   where story_id = p_story and (visitor = p_visitor or (p_user is not null and user_id = p_user));
  if found then return; end if;
  if p_user is not null then
    insert into public.scout_devices (user_id, visitor) values (p_user, p_visitor) on conflict do nothing;
    f := private.scout_flags(p_user, p_visitor, p_story, p_at);
  else
    f := '{}';
  end if;
  select * into h from public.hotspots where story_id = p_story;
  /* every save committed before this one (the story row is locked), whatever its clock said */
  k := private.keepers(p_story, 'infinity');
  insert into public.scout_calls (user_id, visitor, story_id, lane, called_at, source, keepers_before, position, opens, exposed,
                                  was_hot, hot_rank, story_age_min, scored, flags)
  values (p_user, p_visitor, p_story, st.lane, p_at, case when p_user is null then 'anonymous' else 'signed_in' end,
          k, k + 1,
          private.people(p_story, 'open', 'infinity'),
          (select count(distinct visitor)::int from public.impressions where story_id = p_story),
          st.hot_at is not null and st.hot_at <= p_at, h.rank,
          greatest(0, floor(extract(epoch from p_at - st.starts_at) / 60))::int,
          p_user is not null and cardinality(f) = 0, f)
  on conflict do nothing;
  if p_user is not null then
    insert into public.scout_profiles (user_id) values (p_user) on conflict do nothing;
  end if;
end $$;

create or replace function public.record_event(p_key text, p_story uuid, p_kind text, p_visitor text, p_ip_hash text, p_user uuid default null)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_id bigint; v_n int; v_at timestamptz;
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

/* signing in: the Timeheart that prompted it is judged at the moment it was given */
create or replace function public.scout_attach(p_key text, p_user uuid, p_visitor text, p_story uuid default null) returns jsonb
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
      f := private.scout_flags(p_user, p_visitor, c.story_id, c.called_at, c.id);
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

revoke all on function private.scout_flags(uuid, text, uuid, timestamptz, bigint), private.scout_record(uuid, text, uuid, timestamptz)
  from public, anon, authenticated;
