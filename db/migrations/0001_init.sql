-- Fivehundrd. The Wall: initial schema (BUILD_BRIEF §14, revised for §0).
--
-- 500 spots per lane, 3,000 in total. A spot is identified by (lane, no);
-- the same number exists once in every lane.

create table lanes (
  id       text primary key,
  label    text not null unique,
  position smallint not null unique
);

insert into lanes (id, label, position) values
  ('music',    'Music',       1),
  ('writers',  'Books',       2),
  ('games',    'Games',       3),
  ('art',      'Creators',    4),
  ('podcasts', 'Podcasts',    5),
  ('letters',  'Newsletters', 6);

-- A story is one maker's 72 hours on one spot. It outlives the spot: saves
-- and events point here, so they never follow a number to its next holder.
create table stories (
  id                uuid primary key default gen_random_uuid(),
  lane              text not null references lanes (id),
  spot_no           smallint not null check (spot_no between 1 and 500),
  name              text not null check (char_length(name) between 1 and 40),
  snippet           text check (char_length(snippet) <= 140),
  artwork_key       text,
  logo_key          text,
  -- §8: an uploaded clip, or a Spotify/Apple embed when there is none.
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
  seed              bigint not null,
  maker_email       text not null,
  stripe_session_id text unique,
  starts_at         timestamptz,
  ends_at           timestamptz,
  opens             integer not null default 0 check (opens >= 0),
  saves             integer not null default 0 check (saves >= 0),
  created_at        timestamptz not null default now(),

  unique (id, lane, spot_no),
  -- §6: production always has real artwork or a logo.
  check (artwork_key is not null or logo_key is not null),
  -- A story is either pending checkout (no times) or live for exactly 72h.
  check (
    (starts_at is null and ends_at is null)
    or ends_at = starts_at + interval '72 hours'
  ),
  -- §8: each lane's extra block only exists on the lanes that show it.
  check ((audio_key is null and audio_embed_url is null) or lane in ('music', 'podcasts')),
  check ((excerpt is null and excerpt_title is null) or lane in ('writers', 'letters')),
  check ((trailer_url is null and trailer_len is null) or lane in ('art', 'games'))
);

create table spots (
  lane           text not null references lanes (id),
  no             smallint not null check (no between 1 and 500),
  status         text not null default 'vacant'
                   check (status in ('vacant', 'reserved', 'live')),
  reserved_until timestamptz,
  story_id       uuid,
  primary key (lane, no),
  -- The story on a spot must belong to that same lane and number.
  foreign key (story_id, lane, no) references stories (id, lane, spot_no),
  -- Vacant spots hold nothing; reserved and live spots hold a story.
  check ((status = 'vacant') = (story_id is null)),
  -- Only a reservation expires (§15: 15 minutes to finish checkout).
  check ((status = 'reserved') = (reserved_until is not null))
);

-- One story per spot at a time.
create unique index spots_story_id_key on spots (story_id);

-- The "every minute" job scans only what can expire.
create index spots_reserved_until_idx on spots (reserved_until) where status = 'reserved';
create index stories_ends_at_idx on stories (ends_at) where ends_at is not null;

insert into spots (lane, no)
select lanes.id, n
from lanes, generate_series(1, 500) as n;

create table accounts (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,
  provider   text not null check (provider in ('google', 'apple', 'email')),
  remind     boolean not null default true,
  created_at timestamptz not null default now()
);

-- §11: saves are keyed by story, so they survive the spot ending.
create table saves (
  visitor    text not null,
  account_id uuid references accounts (id) on delete set null,
  story_id   uuid not null references stories (id) on delete cascade,
  saved_at   timestamptz not null default now(),
  primary key (visitor, story_id)
);

create index saves_account_id_idx on saves (account_id) where account_id is not null;

create table events (
  id       bigint generated always as identity primary key,
  story_id uuid not null references stories (id) on delete cascade,
  -- `entry`: the story was where a visitor's wall started (§15 wrap-up mail).
  kind     text not null
             check (kind in ('open', 'save', 'unsave', 'link_click', 'share', 'entry')),
  visitor  text not null,
  ip_hash  text,
  at       timestamptz not null default now(),
  day      date not null default ((now() at time zone 'UTC')::date)
);

-- §6: an open counts once per visitor per story per day, so the wrap-up
-- mail's numbers cannot be inflated by reloading.
create unique index events_open_once_idx on events (story_id, visitor, day) where kind = 'open';
create index events_story_id_idx on events (story_id, kind);
