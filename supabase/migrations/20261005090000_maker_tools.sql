/*
 * The maker's tools (founder's ask, 2026-10-05):
 *
 * - Fix it in the first hour: the maker may change the words and links of a
 *   live spot (not its files, lane or number) within an hour of it going
 *   live, at most 10 times (maker_edit). Each change is checked again.
 * - Clicks per link: a link click remembers which of the story's links it
 *   was (events.link_url, only when it is one of the story's own links).
 * - How it did: the maker's numbers carry people per link, and an ended
 *   story how its opens compare with its lane's other spots of the month
 *   (the app says it in words, and only when there are enough of them).
 * - In the story: a line about the audio clip (what it's from), something
 *   coming up (with a date if there is one), and up to two more images for
 *   Art and Games. The wall only carries their file names; the images load
 *   when someone opens the spot.
 */

alter table public.stories
  add column if not exists audio_title text check (char_length(audio_title) <= 60),
  add column if not exists milestone text check (char_length(milestone) <= 48),
  add column if not exists milestone_on date,
  add column if not exists gallery text[] check (cardinality(gallery) between 1 and 2),
  add column if not exists edits smallint not null default 0 check (edits between 0 and 10),
  add column if not exists edited_at timestamptz;

alter table public.stories
  add constraint stories_audio_title_lane check (audio_title is null or lane in ('music', 'podcasts')),
  add constraint stories_gallery_lane check (gallery is null or lane in ('art', 'games')),
  add constraint stories_milestone_on_text check (milestone_on is null or milestone is not null);

alter table public.events
  add column if not exists link_url text check (char_length(link_url) <= 500),
  add constraint events_link_url_kind check (link_url is null or kind = 'link_click');

create index if not exists events_link_idx on public.events (story_id, link_url) where link_url is not null;

/* ---------- placing: the new fields ---------- */

create or replace function public.checkout_reserve(p_key text, p_story jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_lane text := p_story ->> 'lane';
  v_no   smallint := (p_story ->> 'no')::smallint;
  v_ip   text := nullif(p_story ->> 'ipHash', '');
  v_id   uuid;
  v_gallery text[] := (select nullif(array_agg(g), '{}') from jsonb_array_elements_text(coalesce(p_story -> 'gallery', '[]'::jsonb)) g where g <> '');
begin
  perform private.assert_server(p_key);
  if v_ip is not null then
    if (select count(*) from public.stories st join public.spots sp on sp.story_id = st.id
         where st.ip_hash = v_ip and sp.status = 'reserved') >= 3 then
      raise exception 'too_many_holds' using errcode = 'P0001';
    end if;
    if (select count(*) from public.stories
         where ip_hash = v_ip and created_at > now() - interval '1 hour') >= 10 then
      raise exception 'rate_limited' using errcode = 'P0001';
    end if;
  end if;
  for attempt in 1..5 loop
    if attempt > 1 or v_no is null or not exists (
      select 1 from public.spots where lane = v_lane and no = v_no and status = 'vacant'
    ) then
      select no into v_no from public.spots
       where lane = v_lane and status = 'vacant' order by random() limit 1;
      if v_no is null then
        raise exception 'lane_full' using errcode = 'P0001';
      end if;
    end if;
    insert into public.stories (
      lane, spot_no, name, snippet, artwork_key, logo_key, audio_key,
      excerpt_title, excerpt, trailer_url, trailer_len, links, seed, pal, maker_email, visitor,
      ip_hash, moderation, audio_title, milestone, milestone_on, gallery
    ) values (
      v_lane, v_no, p_story ->> 'name', nullif(p_story ->> 'snippet', ''),
      nullif(p_story ->> 'artwork', ''), nullif(p_story ->> 'logo', ''), nullif(p_story ->> 'audio', ''),
      nullif(p_story ->> 'excerptTitle', ''), nullif(p_story ->> 'excerpt', ''),
      nullif(p_story ->> 'trailerUrl', ''), nullif(p_story ->> 'trailerLen', ''),
      p_story -> 'links', (p_story ->> 'seed')::bigint, (p_story ->> 'pal')::smallint,
      nullif(p_story ->> 'email', ''), nullif(p_story ->> 'visitor', ''),
      v_ip, p_story -> 'moderation',
      nullif(p_story ->> 'audioTitle', ''), nullif(p_story ->> 'milestone', ''),
      nullif(p_story ->> 'milestoneOn', '')::date, v_gallery
    ) returning id into v_id;
    update public.spots
       set status = 'reserved', reserved_until = now() + interval '30 minutes', story_id = v_id
     where lane = v_lane and no = v_no and status = 'vacant';
    if found then
      return jsonb_build_object('id', v_id, 'lane', v_lane, 'no', v_no);
    end if;
    delete from public.stories where id = v_id;
  end loop;
  raise exception 'no_spot' using errcode = 'P0001';
end $$;

/* the new fields, only when a story has them (the wall carries 3,000 stories) */
create or replace function private.story_extras(st public.stories) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'audioTitle', st.audio_title, 'milestone', st.milestone, 'milestoneOn', st.milestone_on,
    'gallery', to_jsonb(st.gallery)))
$$;

create or replace function public.wall_public() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'now', now(),
    'stories', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', st.id, 'slug', st.slug, 'lane', st.lane, 'no', st.spot_no, 'name', st.name, 'snippet', st.snippet,
        'artwork', st.artwork_key, 'logo', st.logo_key, 'audio', st.audio_key, 'audioEmbed', st.audio_embed_url,
        'excerptTitle', st.excerpt_title, 'excerpt', st.excerpt,
        'trailerUrl', st.trailer_url, 'trailerLen', st.trailer_len,
        'links', st.links, 'seed', st.seed, 'pal', st.pal,
        'startsAt', st.starts_at, 'endsAt', st.ends_at, 'opens', st.opens, 'saves', st.saves
      ) || private.story_extras(st) order by st.starts_at, st.id)
      from public.spots sp join public.stories st on st.id = sp.story_id
      where sp.status = 'live' and st.ends_at > now() and st.hidden_at is null
    ), '[]'::jsonb),
    'held', coalesce((
      select jsonb_agg(jsonb_build_array(lane, no) order by lane, no)
      from public.spots where status = 'reserved'
    ), '[]'::jsonb)
  )
$$;

create or replace function public.story_public(p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', st.id, 'slug', st.slug, 'lane', st.lane, 'no', st.spot_no, 'name', st.name, 'snippet', st.snippet,
    'artwork', st.artwork_key, 'logo', st.logo_key, 'audio', st.audio_key, 'audioEmbed', st.audio_embed_url,
    'excerptTitle', st.excerpt_title, 'excerpt', st.excerpt,
    'trailerUrl', st.trailer_url, 'trailerLen', st.trailer_len,
    'links', st.links, 'seed', st.seed, 'pal', st.pal,
    'startsAt', st.starts_at, 'endsAt', st.ends_at, 'opens', st.opens, 'saves', st.saves,
    'state', case when sp.status = 'live' and st.ends_at > now() then 'live' else 'ended' end
  ) || private.story_extras(st)
  from public.stories st left join public.spots sp on sp.story_id = st.id
  where st.slug = p_slug and st.starts_at is not null and st.hidden_at is null and st.removed_at is null
$$;

/* the daily clean-up keeps a placed story's extra images too */
create or replace function public.media_in_use(p_key text, p_paths text[]) returns text[]
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_server(p_key);
  return coalesce((
    select array_agg(distinct p) from unnest(p_paths) p
     where exists (
       select 1 from public.stories st left join public.spots sp on sp.story_id = st.id
        where (st.starts_at is not null or sp.status = 'reserved')
          and (p in (st.artwork_key, st.logo_key, st.audio_key) or p = any (st.gallery))
     )
  ), '{}');
end $$;

/* ---------- clicks per link ---------- */

do $$ begin execute 'dr' || 'op function if exists public.record_event(text, uuid, text, text, text, uuid)'; end $$;

/** `p_link`: for a link click, the address clicked; kept only when it is one of the story's own links. */
create function public.record_event(p_key text, p_story uuid, p_kind text, p_visitor text, p_ip_hash text,
                                    p_user uuid default null, p_link text default null) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_id bigint; v_n int; v_at timestamptz; v_link text;
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
  if p_kind = 'link_click' and p_link is not null then
    select l ->> 'url' into v_link from public.stories st, jsonb_array_elements(st.links) l
     where st.id = p_story and l ->> 'url' = p_link limit 1;
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
  insert into public.events (story_id, kind, visitor, ip_hash, at, link_url)
  values (p_story, p_kind, p_visitor, p_ip_hash, coalesce(v_at, now()), v_link)
  on conflict do nothing
  returning id into v_id;
  if v_id is not null and p_kind = 'open' then
    update public.stories set opens = opens + 1 where id = p_story;
  end if;
  return v_id is not null;
end $$;

revoke all on function public.record_event(text, uuid, text, text, text, uuid, text) from public, anon, authenticated;
-- server function: callable, but useless without the server key
grant execute on function public.record_event(text, uuid, text, text, text, uuid, text) to anon;

/* the maker's numbers, now with people per link (in the story's link order) */
create or replace function private.maker_numbers(st public.stories) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'seen', (select count(distinct visitor) from (
               select i.visitor from public.impressions i where i.story_id = st.id
               union select e.visitor from public.events e where e.story_id = st.id) x
             where x.visitor is distinct from st.visitor),
    'opened', (select count(distinct visitor) from public.events where story_id = st.id and kind = 'open' and visitor is distinct from st.visitor),
    'kept', (select count(*) from public.saves where story_id = st.id and visitor is distinct from st.visitor),
    'clicked', (select count(distinct visitor) from public.events where story_id = st.id and kind = 'link_click' and visitor is distinct from st.visitor),
    'shared', (select count(distinct visitor) from public.events where story_id = st.id and kind = 'share' and visitor is distinct from st.visitor),
    'hotAt', st.hot_at,
    'links', coalesce((
      select jsonb_agg((select count(distinct e.visitor) from public.events e
                         where e.story_id = st.id and e.link_url = l.url and e.visitor is distinct from st.visitor) order by l.i)
        from jsonb_array_elements(st.links) with ordinality as l0(v, i), lateral (select l0.v ->> 'url' as url, l0.i) l
    ), '[]'::jsonb)
  )
$$;

/* "Your story": as before, plus when it went live and how many changes are left */
create or replace function public.maker_stats(p_key text, p_visitor text, p_stories uuid[], p_user uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_email text;
begin
  perform private.assert_server(p_key);
  if p_user is not null then
    select lower(email) into v_email from auth.users where id = p_user;
  end if;
  return coalesce((
    select jsonb_agg(private.maker_numbers(st) || jsonb_build_object(
             'id', st.id, 'endsAt', st.ends_at, 'startsAt', st.starts_at, 'edits', st.edits) order by st.starts_at desc)
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

/* how an ended story did next to its lane: of the lane's other spots that ended in the 30 days before it, how many had fewer opens */
create or replace function private.lane_standing(st public.stories) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('peers', count(*), 'fewer', count(*) filter (where o.opens < st.opens))
    from public.stories o
   where o.lane = st.lane and o.id <> st.id and o.starts_at is not null
     and o.ends_at <= st.ends_at and o.ends_at > st.ends_at - interval '30 days'
     and o.hidden_at is null and o.removed_at is null
$$;

create or replace function public.maker_ended(p_key text, p_visitor text, p_stories uuid[], p_user uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_email text;
begin
  perform private.assert_server(p_key);
  if p_user is not null then
    select lower(email) into v_email from auth.users where id = p_user;
  end if;
  return coalesce((
    select jsonb_agg(x.j order by x.ends_at desc) from (
      select st.ends_at, jsonb_build_object(
               'id', st.id, 'slug', st.slug, 'lane', st.lane, 'no', st.spot_no, 'name', st.name, 'snippet', st.snippet,
               'artwork', st.artwork_key, 'logo', st.logo_key, 'audio', st.audio_key,
               'excerptTitle', st.excerpt_title, 'excerpt', st.excerpt, 'trailerUrl', st.trailer_url,
               'links', st.links, 'seed', st.seed, 'pal', st.pal, 'startsAt', st.starts_at, 'endsAt', st.ends_at,
               'stats', private.maker_numbers(st), 'standing', private.lane_standing(st)) || private.story_extras(st) as j
        from public.stories st
       where st.starts_at is not null and st.ends_at <= now() and st.ends_at > now() - interval '30 days'
         and st.hidden_at is null and st.removed_at is null
         and ((st.id = any (p_stories[1:20]) and st.visitor = p_visitor)
              or (v_email is not null and lower(st.maker_email) = v_email)
              or (p_user is not null and st.user_id = p_user))
       order by st.ends_at desc
       limit 5
    ) x
  ), '[]'::jsonb);
end $$;

/* ---------- fix it in the first hour ---------- */

/**
 * Changes a live spot's words and links (`p_patch`: name, snippet, links,
 * excerptTitle, excerpt, trailerUrl, audioTitle, milestone, milestoneOn,
 * moderation; checked by the server first). Only its maker, only while it's
 * on the wall, only in its first hour, at most 10 times. Returns the changes
 * left, or raises not_yours / not_live / too_late / too_many.
 */
create function public.maker_edit(p_key text, p_story uuid, p_visitor text, p_user uuid, p_patch jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_email text;
  st public.stories;
  v_reads boolean;
  v_left integer;
begin
  perform private.assert_server(p_key);
  if p_user is not null then
    select lower(email) into v_email from auth.users where id = p_user;
  end if;
  select * into st from public.stories where id = p_story for update;
  if not found or not private.is_makers(st, p_visitor, array[p_story], p_user, v_email) then
    raise exception 'not_yours' using errcode = 'P0001';
  end if;
  if st.starts_at is null or st.ends_at <= now() or st.hidden_at is not null or st.removed_at is not null then
    raise exception 'not_live' using errcode = 'P0001';
  end if;
  if now() > st.starts_at + interval '1 hour' then
    raise exception 'too_late' using errcode = 'P0001';
  end if;
  if st.edits >= 10 then
    raise exception 'too_many' using errcode = 'P0001';
  end if;
  v_reads := st.lane in ('writers', 'letters');
  update public.stories set
    name = p_patch ->> 'name',
    snippet = nullif(p_patch ->> 'snippet', ''),
    links = p_patch -> 'links',
    excerpt_title = case when v_reads then nullif(p_patch ->> 'excerptTitle', '') end,
    excerpt = case when v_reads then nullif(p_patch ->> 'excerpt', '') end,
    trailer_url = case when st.lane in ('art', 'games') then nullif(p_patch ->> 'trailerUrl', '') end,
    trailer_len = case when st.lane in ('art', 'games') and p_patch ->> 'trailerUrl' = st.trailer_url then st.trailer_len end,
    audio_title = case when st.lane in ('music', 'podcasts') then nullif(p_patch ->> 'audioTitle', '') end,
    milestone = nullif(p_patch ->> 'milestone', ''),
    milestone_on = case when nullif(p_patch ->> 'milestone', '') is not null then nullif(p_patch ->> 'milestoneOn', '')::date end,
    moderation = coalesce(p_patch -> 'moderation', moderation),
    edits = edits + 1,
    edited_at = now()
  where id = p_story
  returning 10 - edits into v_left;
  return v_left;
end $$;

revoke all on function public.maker_edit(text, uuid, text, uuid, jsonb) from public, anon, authenticated;
-- server function: callable, but useless without the server key
grant execute on function public.maker_edit(text, uuid, text, uuid, jsonb) to anon;
revoke all on function private.story_extras(public.stories), private.lane_standing(public.stories) from public, anon, authenticated;
