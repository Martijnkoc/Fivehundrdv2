/*
 * "Your story" from any device, and 72 more hours on the same number
 * (founder's ask, 2026-10-03).
 *
 * - A story placed while signed in remembers the account (stories.user_id),
 *   so the maker sees their live spot's numbers wherever they sign in, not
 *   only in the browser that placed it.
 * - maker_stats takes the account too: the stories this browser placed, plus
 *   the account's live ones (by user id, or by the email given at checkout).
 * - maker_extend keeps a live spot on the wall for 72 more hours, same
 *   number, same story. Only its maker can, only in its last 24 hours (so
 *   nobody holds a number by renewing it early), and only while it is on
 *   the wall. Free spots only for now: paid renewal goes through Stripe
 *   later, and the app doesn't offer it while payments are on.
 */

alter table public.stories add column if not exists user_id uuid references auth.users (id) on delete set null;
create index if not exists stories_user_id_idx on public.stories (user_id) where user_id is not null;

/* a story can now run longer than 72 hours, never shorter */
do $$
declare c text;
begin
  select conname into c from pg_constraint
   where conrelid = 'public.stories'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) like '%72:00:00%';
  if c is not null then
    execute format('alter table public.stories drop constraint %I', c);
  end if;
end $$;
alter table public.stories add constraint stories_life_check check (
  (starts_at is null and ends_at is null) or ends_at >= starts_at + interval '72 hours'
);

/* free_place, now with the signed-in account (p_story ->> 'user') */
create or replace function public.free_place(p_key text, p_story jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ip   text := nullif(p_story ->> 'ipHash', '');
  v_user uuid := nullif(p_story ->> 'user', '')::uuid;
  v      jsonb;
begin
  perform private.assert_server(p_key);
  if v_ip is not null then
    perform pg_advisory_xact_lock(hashtextextended('free_place:' || v_ip, 0));
    if (
      select count(*) from public.stories
       where ip_hash = v_ip and starts_at is not null and ends_at > now()
         and removed_at is null and coalesce(amount_total, 0) = 0
    ) >= 3 then
      raise exception 'too_many_live' using errcode = 'P0001';
    end if;
  end if;
  v := public.checkout_reserve(p_key, p_story);
  if v_user is not null then
    update public.stories set user_id = v_user where id = (v ->> 'id')::uuid;
  end if;
  perform public.checkout_complete(p_key, (v ->> 'id')::uuid, null, 0, 'usd');
  return v;
end $$;

/* whose story is it: this browser's (visitor + id), or this account's */
create or replace function private.is_makers(st public.stories, p_visitor text, p_stories uuid[], p_user uuid, p_email text)
returns boolean language sql stable set search_path = '' as $$
  select (st.id = any (p_stories[1:20]) and st.visitor = p_visitor)
      or (p_user is not null and st.user_id = p_user)
      or (p_email is not null and lower(st.maker_email) = p_email)
$$;

drop function if exists public.maker_stats(text, text, uuid[]);
/** "Your story": this browser's stories, plus the account's live ones; each with its numbers and end. */
create function public.maker_stats(p_key text, p_visitor text, p_stories uuid[], p_user uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_email text;
begin
  perform private.assert_server(p_key);
  if p_user is not null then
    select lower(email) into v_email from auth.users where id = p_user;
  end if;
  return coalesce((
    select jsonb_agg(private.maker_numbers(st) || jsonb_build_object('id', st.id, 'endsAt', st.ends_at) order by st.starts_at desc)
      from public.stories st
     where st.id in (
       select s.id from public.stories s
        where s.starts_at is not null and s.removed_at is null
          and ((s.id = any (p_stories[1:20]) and s.visitor = p_visitor)
               or (s.ends_at > now() and private.is_makers(s, p_visitor, p_stories, p_user, v_email)))
        order by s.starts_at desc
        limit 20)
  ), '[]'::jsonb);
end $$;

/**
 * 72 more hours for a live spot, same number. Returns the new end, or raises
 * not_yours / not_live / too_early.
 */
create function public.maker_extend(p_key text, p_story uuid, p_visitor text, p_user uuid default null) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  v_email text;
  st public.stories;
  v_end timestamptz;
begin
  perform private.assert_server(p_key);
  if p_user is not null then
    select lower(email) into v_email from auth.users where id = p_user;
  end if;
  select * into st from public.stories where id = p_story for update;
  if not found or not private.is_makers(st, p_visitor, array[p_story], p_user, v_email) then
    raise exception 'not_yours' using errcode = 'P0001';
  end if;
  if st.starts_at is null or st.ends_at <= now() or st.hidden_at is not null or st.removed_at is not null
     or not exists (select 1 from public.spots where story_id = p_story and status = 'live') then
    raise exception 'not_live' using errcode = 'P0001';
  end if;
  if st.ends_at > now() + interval '24 hours' then
    raise exception 'too_early' using errcode = 'P0001';
  end if;
  update public.stories set ends_at = ends_at + interval '72 hours' where id = p_story
  returning ends_at into v_end;
  return v_end;
end $$;

revoke all on function public.maker_stats(text, text, uuid[], uuid), public.maker_extend(text, uuid, text, uuid)
  from public, anon, authenticated;
-- server functions: callable, but useless without the server key
grant execute on function public.maker_stats(text, text, uuid[], uuid), public.maker_extend(text, uuid, text, uuid) to anon;
revoke all on function private.is_makers(public.stories, text, uuid[], uuid, text) from public, anon, authenticated;
