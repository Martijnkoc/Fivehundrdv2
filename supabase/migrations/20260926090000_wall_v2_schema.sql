-- Fivehundrd. The Wall v2: schema and API (BUILD_BRIEF §0, §11, §12, §14, §15).
--
-- 500 spots per lane, 3,000 in total; a spot is (lane, no). Visitors read
-- the public wall through wall_public(). Everything that changes the wall
-- (checkout, the Stripe webhook, counters) goes through the app's server,
-- which proves itself with the server key kept in Vault
-- ('fivehundrd_server_key'); anon and authenticated have no table access.
--
-- The live teaser tables (early_access_signups, early_access_events) are not
-- touched here.

create schema if not exists private;

-- ---------------------------------------------------------------- tables ---

create table public.lanes (
  id       text primary key,
  label    text not null unique,
  position smallint not null unique
);

insert into public.lanes (id, label, position) values
  ('music',    'Music',       1),
  ('writers',  'Books',       2),
  ('games',    'Games',       3),
  ('art',      'Creators',    4),
  ('podcasts', 'Podcasts',    5),
  ('letters',  'Newsletters', 6);

-- A story is one maker's 72 hours on one spot. It outlives the spot: saves
-- and events point here, so they never follow a number to its next holder.
create table public.stories (
  id                uuid primary key default gen_random_uuid(),
  lane              text not null references public.lanes (id),
  spot_no           smallint not null check (spot_no between 1 and 500),
  name              text not null check (char_length(name) between 1 and 40),
  snippet           text check (char_length(snippet) <= 140),
  -- storage object paths (buckets 'art' and 'audio')
  artwork_key       text,
  logo_key          text,
  audio_key         text,
  audio_embed_url   text,
  excerpt_title     text check (char_length(excerpt_title) <= 60),
  excerpt           text check (char_length(excerpt) <= 2500),
  trailer_url       text,
  trailer_len       text,
  links             jsonb not null check (
                      jsonb_typeof(links) = 'array'
                      and jsonb_array_length(links) between 1 and 3
                    ),
  -- the printed pattern when a maker has no image yet (§13 form copy)
  seed              bigint not null,
  pal               smallint not null check (pal between 0 and 11),
  maker_email       text,
  visitor           text,
  stripe_session_id text unique,
  starts_at         timestamptz,
  ends_at           timestamptz,
  opens             integer not null default 0 check (opens >= 0),
  saves             integer not null default 0 check (saves >= 0),
  created_at        timestamptz not null default now(),

  unique (id, lane, spot_no),
  check (
    (starts_at is null and ends_at is null)
    or ends_at = starts_at + interval '72 hours'
  ),
  check ((audio_key is null and audio_embed_url is null) or lane in ('music', 'podcasts')),
  check ((excerpt is null and excerpt_title is null) or lane in ('writers', 'letters')),
  check ((trailer_url is null and trailer_len is null) or lane in ('art', 'games'))
);

create table public.spots (
  lane           text not null references public.lanes (id),
  no             smallint not null check (no between 1 and 500),
  status         text not null default 'vacant'
                   check (status in ('vacant', 'reserved', 'live')),
  reserved_until timestamptz,
  story_id       uuid,
  primary key (lane, no),
  foreign key (story_id, lane, no) references public.stories (id, lane, spot_no),
  check ((status = 'vacant') = (story_id is null)),
  check ((status = 'reserved') = (reserved_until is not null))
);

create unique index spots_story_id_key on public.spots (story_id);
create index spots_reserved_until_idx on public.spots (reserved_until) where status = 'reserved';
create index spots_live_idx on public.spots (lane, no) where status = 'live';
create index stories_ends_at_idx on public.stories (ends_at) where ends_at is not null;

insert into public.spots (lane, no)
select lanes.id, n from public.lanes, generate_series(1, 500) as n;

-- §12: optional accounts (Supabase Auth); reminders on by default.
create table public.profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  remind     boolean not null default true,
  created_at timestamptz not null default now()
);

-- §11: saves by story; synced to an account once the visitor logs in.
create table public.saves (
  visitor  text not null,
  user_id  uuid references auth.users (id) on delete set null,
  story_id uuid not null references public.stories (id) on delete cascade,
  saved_at timestamptz not null default now(),
  primary key (visitor, story_id)
);
create index saves_user_id_idx on public.saves (user_id) where user_id is not null;
create index saves_story_id_idx on public.saves (story_id);

create table public.events (
  id       bigint generated always as identity primary key,
  story_id uuid not null references public.stories (id) on delete cascade,
  kind     text not null
             check (kind in ('open', 'save', 'unsave', 'link_click', 'share', 'entry')),
  visitor  text not null,
  ip_hash  text,
  at       timestamptz not null default now(),
  day      date not null default ((now() at time zone 'UTC')::date)
);
-- an open counts once per visitor per story per day
create unique index events_open_once_idx on public.events (story_id, visitor, day) where kind = 'open';
create index events_story_id_idx on public.events (story_id, kind);
create index events_visitor_at_idx on public.events (visitor, at);

-- Row level security everywhere; nothing is readable or writable directly
-- except a signed-in visitor's own profile and saves.
alter table public.lanes    enable row level security;
alter table public.stories  enable row level security;
alter table public.spots    enable row level security;
alter table public.profiles enable row level security;
alter table public.saves    enable row level security;
alter table public.events   enable row level security;

create policy "own profile" on public.profiles for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own saves" on public.saves for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- -------------------------------------------------------------- helpers ---

create function private.assert_server(p_key text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_key is null or not exists (
    select 1 from vault.decrypted_secrets
     where name = 'fivehundrd_server_key' and decrypted_secret = p_key
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end $$;

-- ----------------------------------------------------------- public API ---

/** GET /api/wall: every live story, and which spots are held by a checkout. */
create function public.wall_public() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'now', now(),
    'stories', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', st.id, 'lane', st.lane, 'no', st.spot_no, 'name', st.name, 'snippet', st.snippet,
        'artwork', st.artwork_key, 'logo', st.logo_key, 'audio', st.audio_key, 'audioEmbed', st.audio_embed_url,
        'excerptTitle', st.excerpt_title, 'excerpt', st.excerpt,
        'trailerUrl', st.trailer_url, 'trailerLen', st.trailer_len,
        'links', st.links, 'seed', st.seed, 'pal', st.pal,
        'startsAt', st.starts_at, 'endsAt', st.ends_at, 'opens', st.opens, 'saves', st.saves
      ) order by st.starts_at, st.id)
      from public.spots sp join public.stories st on st.id = sp.story_id
      where sp.status = 'live' and st.ends_at > now()
    ), '[]'::jsonb),
    'held', coalesce((
      select jsonb_agg(jsonb_build_array(lane, no) order by lane, no)
      from public.spots where status = 'reserved'
    ), '[]'::jsonb)
  )
$$;

/** A signed-in visitor's saves with their story snapshots (§11, §12). */
create function public.my_saves() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', st.id, 'lane', st.lane, 'no', st.spot_no, 'name', st.name,
    'startsAt', st.starts_at, 'link', st.links -> 0, 'artwork', st.artwork_key, 'logo', st.logo_key,
    'seed', st.seed, 'pal', st.pal, 'savedAt', min_saved
  ) order by min_saved desc), '[]'::jsonb)
  from (
    select story_id, min(saved_at) as min_saved from public.saves
     where user_id = (select auth.uid()) group by story_id
  ) s join public.stories st on st.id = s.story_id
$$;

-- ----------------------------------------------------------- server API ---

/**
 * POST /api/checkout: stores the story and holds its spot for 30 minutes.
 * Takes the requested number if it is still open, otherwise another open
 * number in the same lane. Returns { id, lane, no }.
 */
create function public.checkout_reserve(p_key text, p_story jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_lane text := p_story ->> 'lane';
  v_no   smallint := (p_story ->> 'no')::smallint;
  v_id   uuid;
begin
  perform private.assert_server(p_key);
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
      excerpt_title, excerpt, trailer_url, trailer_len, links, seed, pal, maker_email, visitor
    ) values (
      v_lane, v_no, p_story ->> 'name', nullif(p_story ->> 'snippet', ''),
      nullif(p_story ->> 'artwork', ''), nullif(p_story ->> 'logo', ''), nullif(p_story ->> 'audio', ''),
      nullif(p_story ->> 'excerptTitle', ''), nullif(p_story ->> 'excerpt', ''),
      nullif(p_story ->> 'trailerUrl', ''), nullif(p_story ->> 'trailerLen', ''),
      p_story -> 'links', (p_story ->> 'seed')::bigint, (p_story ->> 'pal')::smallint,
      nullif(p_story ->> 'email', ''), nullif(p_story ->> 'visitor', '')
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

/** After creating the Checkout session: remember it, and hold the spot exactly until it expires. */
create function public.checkout_attach(p_key text, p_story uuid, p_session text, p_expires_at bigint) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_server(p_key);
  update public.stories set stripe_session_id = p_session where id = p_story and starts_at is null;
  update public.spots set reserved_until = to_timestamp(p_expires_at)
   where story_id = p_story and status = 'reserved';
  return found;
end $$;

/** Stripe checkout.session.completed: the spot goes live for 72 hours. Idempotent. */
create function public.checkout_complete(p_key text, p_story uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  perform private.assert_server(p_key);
  with live as (
    update public.stories
       set starts_at = now(), ends_at = now() + interval '72 hours'
     where id = p_story and starts_at is null
       and exists (select 1 from public.spots where story_id = p_story and status = 'reserved')
    returning id
  )
  update public.spots set status = 'live', reserved_until = null
   where story_id in (select id from live)
  returning jsonb_build_object('lane', lane, 'no', no) into v;
  return v;
end $$;

/** Stripe checkout.session.expired: free the number straight away. */
create function public.checkout_release(p_key text, p_story uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_server(p_key);
  update public.spots set status = 'vacant', reserved_until = null, story_id = null
   where story_id = p_story and status = 'reserved';
  return found;
end $$;

/** Where a checkout stands, for the page the maker returns to. */
create function public.checkout_status(p_key text, p_story uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_server(p_key);
  return (
    select jsonb_build_object('status', coalesce(sp.status, 'released'), 'lane', st.lane, 'no', st.spot_no,
                              'name', st.name, 'startsAt', st.starts_at, 'endsAt', st.ends_at)
      from public.stories st left join public.spots sp on sp.story_id = st.id
     where st.id = p_story
  );
end $$;

/**
 * POST /api/events: opens (once per visitor per story per day), saves and
 * unsaves (kept per visitor, counted on the story), link clicks, shares and
 * entries. At most 300 events per visitor per hour are recorded.
 */
create function public.record_event(p_key text, p_story uuid, p_kind text, p_visitor text, p_ip_hash text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  perform private.assert_server(p_key);
  if (select count(*) from public.events where visitor = p_visitor and at > now() - interval '1 hour') >= 300 then
    return false;
  end if;
  if not exists (select 1 from public.stories where id = p_story and starts_at is not null) then
    return false;
  end if;
  if p_kind = 'save' then
    insert into public.saves (visitor, story_id) values (p_visitor, p_story) on conflict do nothing;
    if not found then return false; end if;
    update public.stories set saves = saves + 1 where id = p_story;
  elsif p_kind = 'unsave' then
    delete from public.saves where visitor = p_visitor and story_id = p_story;
    if not found then return false; end if;
    update public.stories set saves = greatest(0, saves - 1) where id = p_story;
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

/** Every minute (pg_cron): abandoned checkouts free their number; 72 hours over, a spot frees up. */
create function private.wall_tick() returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.spots set status = 'vacant', reserved_until = null, story_id = null
   where status = 'reserved' and reserved_until < now();
  update public.spots sp set status = 'vacant', story_id = null
    from public.stories st
   where sp.story_id = st.id and sp.status = 'live' and st.ends_at <= now();
end $$;

-- -------------------------------------------------------------- grants ---

-- only this migration's tables; the teaser's grants stay as they are
revoke all on public.lanes, public.stories, public.spots, public.profiles, public.saves, public.events
  from anon, authenticated;
grant select, insert, update, delete on public.saves to authenticated;
grant select, insert, update on public.profiles to authenticated;

revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function public.wall_public(), public.my_saves(),
  public.checkout_reserve(text, jsonb), public.checkout_attach(text, uuid, text, bigint),
  public.checkout_complete(text, uuid), public.checkout_release(text, uuid),
  public.checkout_status(text, uuid), public.record_event(text, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.wall_public() to anon, authenticated;
grant execute on function public.my_saves() to authenticated;
-- server functions: callable, but useless without the server key
grant execute on function public.checkout_reserve(text, jsonb), public.checkout_attach(text, uuid, text, bigint),
  public.checkout_complete(text, uuid), public.checkout_release(text, uuid),
  public.checkout_status(text, uuid), public.record_event(text, uuid, text, text, text)
  to anon;
