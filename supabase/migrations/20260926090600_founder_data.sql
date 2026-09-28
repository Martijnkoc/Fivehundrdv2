-- The Control Room's data layer (docs/founder-dashboard.md): what the wall
-- didn't record yet (visits, sources, impressions, the Create funnel, API
-- health, Stripe fees and chargebacks) and the fd_* functions the founder
-- dashboard reads. Visitors stay anonymous: a random id, a source, a device
-- class and a country. Everything is written and read by the server with the
-- server key; nothing here is readable by visitors.

-- ------------------------------------------------------------ tracking ---

create table public.visitors (
  visitor  text primary key,
  first_at timestamptz not null default now(),
  last_at  timestamptz not null default now(),
  visits   integer not null default 1,
  -- how they first arrived
  source   text not null default 'direct',
  medium   text,
  campaign text,
  referrer text,
  device   text check (device in ('mobile', 'tablet', 'desktop')),
  country  text check (country ~ '^[A-Z]{2}$'),
  landing  text
);
create index visitors_first_at_idx on public.visitors (first_at);

-- One row per session (a new one after 30 minutes away).
create table public.visits (
  id        bigint generated always as identity primary key,
  visitor   text not null,
  at        timestamptz not null default now(),
  client_at timestamptz,
  is_new    boolean not null,
  source    text not null default 'direct',
  medium    text,
  campaign  text,
  referrer  text,
  device    text check (device in ('mobile', 'tablet', 'desktop')),
  country   text check (country ~ '^[A-Z]{2}$'),
  landing   text,
  -- the story a shared link brought them to
  story_id  uuid references public.stories (id) on delete set null
);
create index visits_at_idx on public.visits (at);
create index visits_visitor_at_idx on public.visits (visitor, at);
create index visits_story_idx on public.visits (story_id) where story_id is not null;

-- Product moments that aren't about one story (the Create funnel, client errors).
create table public.track (
  id        bigint generated always as identity primary key,
  at        timestamptz not null default now(),
  client_at timestamptz,
  visitor   text not null,
  kind      text not null check (kind in ('create_start', 'create_step', 'client_error')),
  step      smallint,
  story_id  uuid references public.stories (id) on delete set null,
  props     jsonb
);
create index track_at_idx on public.track (at);
create index track_kind_at_idx on public.track (kind, at);

-- A tile seen on the wall, once per story, visitor and day.
create table public.impressions (
  story_id uuid not null references public.stories (id) on delete cascade,
  visitor  text not null,
  day      date not null default ((now() at time zone 'UTC')::date),
  at       timestamptz not null default now(),
  primary key (story_id, visitor, day)
);
create index impressions_at_idx on public.impressions (at);

create index events_at_idx on public.events (at);
create index events_kind_at_idx on public.events (kind, at);

-- ---------------------------------------------------------- operations ---

-- Per minute and route: requests, errors, time.
create table public.api_minute (
  minute timestamptz not null,
  route  text not null,
  n      integer not null default 0,
  errors integer not null default 0,
  slow   integer not null default 0,
  ms_sum bigint not null default 0,
  ms_max integer not null default 0,
  primary key (minute, route)
);

create table public.ops_log (
  id      bigint generated always as identity primary key,
  at      timestamptz not null default now(),
  kind    text not null check (kind in ('error', 'webhook', 'upload', 'client_error', 'export', 'report')),
  ok      boolean not null default false,
  route   text,
  status  integer,
  ms      integer,
  message text check (char_length(message) <= 2000),
  meta    jsonb
);
create index ops_log_at_idx on public.ops_log (at);
create index ops_log_kind_at_idx on public.ops_log (kind, at);

-- ------------------------------------------------------------- exports ---

create table public.exports (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  finished_at timestamptz,
  created_by  text,
  title       text not null,
  kind        text not null,
  format      text not null check (format in ('csv', 'xlsx', 'pdf')),
  params      jsonb not null default '{}',
  status      text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  rows        integer,
  bytes       integer,
  path        text,
  error       text,
  -- set when a scheduled report made it (daily, weekly, monthly)
  schedule    text
);
create index exports_created_at_idx on public.exports (created_at desc);

-- ------------------------------------------------------ money from Stripe ---

alter table public.stories
  add column stripe_fee     integer check (stripe_fee >= 0),
  add column disputed_at    timestamptz,
  add column dispute_amount integer check (dispute_amount >= 0),
  add column dispute_status text;
create index stories_starts_at_idx on public.stories (starts_at) where starts_at is not null;
create index stories_payment_intent_idx on public.stories (payment_intent) where payment_intent is not null;

alter table public.visitors    enable row level security;
alter table public.visits      enable row level security;
alter table public.track       enable row level security;
alter table public.impressions enable row level security;
alter table public.api_minute  enable row level security;
alter table public.ops_log     enable row level security;
alter table public.exports     enable row level security;
revoke all on public.visitors, public.visits, public.track, public.impressions,
  public.api_minute, public.ops_log, public.exports from anon, authenticated;

-- ------------------------------------------------------- write functions ---

/**
 * A visit (the wall sends one per session). Returns whether the visitor is
 * new. p_v: { visitor, source, medium, campaign, referrer, device, country,
 * landing, slug, clientAt }.
 */
create function public.track_visit(p_key text, p_v jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_visitor text := left(p_v ->> 'visitor', 64);
  v_new     boolean;
  v_story   uuid;
  v_device  text := case when p_v ->> 'device' in ('mobile', 'tablet', 'desktop') then p_v ->> 'device' end;
  v_country text := case when p_v ->> 'country' ~ '^[A-Z]{2}$' then p_v ->> 'country' end;
  v_source  text := coalesce(nullif(left(lower(p_v ->> 'source'), 60), ''), 'direct');
begin
  perform private.assert_server(p_key);
  if v_visitor is null or v_visitor = '' then return false; end if;
  if (select count(*) from public.visits where visitor = v_visitor and at > now() - interval '1 hour') >= 30 then
    return false;
  end if;
  if p_v ->> 'slug' ~ '^[a-z0-9]{8}$' then
    select id into v_story from public.stories where slug = p_v ->> 'slug';
  end if;
  insert into public.visitors (visitor, source, medium, campaign, referrer, device, country, landing)
  values (v_visitor, v_source, left(p_v ->> 'medium', 60), left(p_v ->> 'campaign', 100),
          left(p_v ->> 'referrer', 200), v_device, v_country, left(p_v ->> 'landing', 200))
  on conflict (visitor) do update set last_at = now(), visits = public.visitors.visits + 1
  returning (xmax = 0) into v_new;
  insert into public.visits (visitor, client_at, is_new, source, medium, campaign, referrer, device, country, landing, story_id)
  values (v_visitor, nullif(p_v ->> 'clientAt', '')::timestamptz, v_new, v_source, left(p_v ->> 'medium', 60),
          left(p_v ->> 'campaign', 100), left(p_v ->> 'referrer', 200), v_device, v_country,
          left(p_v ->> 'landing', 200), v_story);
  return v_new;
end $$;

/** A product moment: Create started, a Create step reached, a client error. */
create function public.track_event(p_key text, p_visitor text, p_kind text, p_step integer default null,
                                   p_props jsonb default null, p_client_at timestamptz default null)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_server(p_key);
  if (select count(*) from public.track where visitor = p_visitor and at > now() - interval '1 hour') >= 200 then
    return false;
  end if;
  insert into public.track (visitor, kind, step, props, client_at)
  values (left(p_visitor, 64), p_kind, p_step, p_props, p_client_at);
  return true;
end $$;

/** Tiles a visitor saw (batched); once per story, visitor and day. */
create function public.track_impressions(p_key text, p_visitor text, p_stories uuid[]) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  perform private.assert_server(p_key);
  insert into public.impressions (story_id, visitor)
  select distinct s, left(p_visitor, 64) from unnest(p_stories[1:200]) s
   where exists (select 1 from public.stories where id = s and starts_at is not null)
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

/** One API request, folded into its minute. */
create function public.log_api(p_key text, p_route text, p_status integer, p_ms integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_server(p_key);
  insert into public.api_minute as a (minute, route, n, errors, slow, ms_sum, ms_max)
  values (date_trunc('minute', now()), left(p_route, 80), 1, (p_status >= 500)::int, (p_ms > 1000)::int, p_ms, p_ms)
  on conflict (minute, route) do update set
    n = a.n + 1, errors = a.errors + excluded.errors, slow = a.slow + excluded.slow,
    ms_sum = a.ms_sum + excluded.ms_sum, ms_max = greatest(a.ms_max, excluded.ms_max);
end $$;

create function public.log_ops(p_key text, p_kind text, p_ok boolean, p_route text, p_status integer,
                               p_ms integer, p_message text, p_meta jsonb default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_server(p_key);
  insert into public.ops_log (kind, ok, route, status, ms, message, meta)
  values (p_kind, p_ok, left(p_route, 80), p_status, p_ms, left(p_message, 2000), p_meta);
end $$;

/** Stripe's fee for a story's payment (from its balance transaction). */
create function public.record_fee(p_key text, p_story uuid, p_fee integer) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_server(p_key);
  update public.stories set stripe_fee = p_fee where id = p_story;
  return found;
end $$;

/** A chargeback opened, updated or closed at Stripe. */
create function public.record_dispute(p_key text, p_payment_intent text, p_amount integer, p_status text)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_server(p_key);
  update public.stories
     set disputed_at = coalesce(disputed_at, now()), dispute_amount = p_amount, dispute_status = left(p_status, 40)
   where payment_intent = p_payment_intent;
  return found;
end $$;

-- ------------------------------------------------------------- exports ---

create function public.export_create(p_key text, p_e jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  perform private.assert_server(p_key);
  insert into public.exports (created_by, title, kind, format, params, schedule)
  values (p_e ->> 'createdBy', p_e ->> 'title', p_e ->> 'kind', p_e ->> 'format',
          coalesce(p_e -> 'params', '{}'), p_e ->> 'schedule')
  returning id into v;
  return v;
end $$;

create function public.export_update(p_key text, p_id uuid, p_e jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_server(p_key);
  update public.exports set
    status = coalesce(p_e ->> 'status', status),
    rows = coalesce((p_e ->> 'rows')::int, rows),
    bytes = coalesce((p_e ->> 'bytes')::int, bytes),
    path = coalesce(p_e ->> 'path', path),
    error = coalesce(p_e ->> 'error', error),
    finished_at = case when p_e ->> 'status' in ('done', 'failed') then now() else finished_at end
  where id = p_id;
end $$;

create function public.export_list(p_key text, p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_server(p_key);
  return coalesce((
    select jsonb_agg(to_jsonb(e) order by e.created_at desc)
      from (select * from public.exports order by created_at desc limit least(p_limit, 200)) e
  ), '[]'::jsonb);
end $$;

create function public.export_get(p_key text, p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_server(p_key);
  return (select to_jsonb(e) from public.exports e where id = p_id);
end $$;

-- ------------------------------------------------------ metric helpers ---

/*
 * Filters (p_f): lane, kind (artwork | audio | excerpt | trailer | pattern),
 * visitor (new | returning), source, device, country. Story filters apply
 * to story metrics; visitor filters to everything a visitor did.
 */
create function private.fd_story_ok(p_f jsonb, st public.stories) returns boolean
language sql immutable set search_path = '' as $$
  select (p_f ->> 'lane' is null or st.lane = p_f ->> 'lane')
     and (p_f ->> 'kind' is null or case p_f ->> 'kind'
            when 'artwork' then st.artwork_key is not null
            when 'audio'   then st.audio_key is not null
            when 'excerpt' then st.excerpt is not null
            when 'trailer' then st.trailer_url is not null
            when 'pattern' then st.artwork_key is null and st.logo_key is null
            else true end)
$$;

create function private.fd_has_vf(p_f jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p_f ?| array['visitor', 'source', 'device', 'country'], false)
$$;

/** Visitors matching the visitor filters, for the period. */
create function private.fd_visitors(p_f jsonb, p_from timestamptz, p_to timestamptz) returns setof text
language sql stable set search_path = '' as $$
  select v.visitor from public.visitors v
   where (p_f ->> 'source' is null or v.source = p_f ->> 'source')
     and (p_f ->> 'device' is null or v.device = p_f ->> 'device')
     and (p_f ->> 'country' is null or v.country = p_f ->> 'country')
     and (p_f ->> 'visitor' is null
          or (p_f ->> 'visitor' = 'new' and v.first_at >= p_from and v.first_at < p_to)
          or (p_f ->> 'visitor' = 'returning' and v.first_at < p_from))
$$;

-- --------------------------------------------------------- the metrics ---

/**
 * Every headline number for a period. Money in cents. The 7-day return rate
 * follows the visitors first seen 7 to 14 days before the period's end.
 */
create function public.fd_kpis(p_key text, p_from timestamptz, p_to timestamptz, p_f jsonb default '{}')
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  vf boolean := private.fd_has_vf(p_f);
  sf boolean := p_f ?| array['lane', 'kind'];
  r jsonb;
  v_at timestamptz := least(p_to, now());
begin
  perform private.assert_server(p_key);

  with
  fv as (select x as visitor from private.fd_visitors(p_f, p_from, p_to) x where vf),
  vis as (
    select * from public.visits
     where at >= p_from and at < p_to and (not vf or visitor in (select visitor from fv))
       and (not sf or story_id is null or exists (select 1 from public.stories st where st.id = story_id and private.fd_story_ok(p_f, st)))
  ),
  ev as (
    select e.* from public.events e join public.stories st on st.id = e.story_id
     where e.at >= p_from and e.at < p_to and (not vf or e.visitor in (select visitor from fv))
       and (not sf or private.fd_story_ok(p_f, st))
  ),
  imp as (
    select i.* from public.impressions i join public.stories st on st.id = i.story_id
     where i.at >= p_from and i.at < p_to and (not vf or i.visitor in (select visitor from fv))
       and (not sf or private.fd_story_ok(p_f, st))
  ),
  tr as (
    select * from public.track
     where at >= p_from and at < p_to and (not vf or visitor in (select visitor from fv))
  ),
  paid as (
    select st.* from public.stories st
     where st.starts_at >= p_from and st.starts_at < p_to and private.fd_story_ok(p_f, st)
       and (not vf or st.visitor in (select visitor from fv))
  ),
  started as (
    select st.* from public.stories st
     where st.created_at >= p_from and st.created_at < p_to and private.fd_story_ok(p_f, st)
       and (not vf or st.visitor in (select visitor from fv))
  ),
  cohort as (
    select v.visitor, v.first_at from public.visitors v
     where v.first_at >= p_to - interval '14 days' and v.first_at < p_to - interval '7 days'
       and (not vf or v.visitor in (select visitor from fv))
  )
  select jsonb_build_object(
    'visitors',        (select count(distinct visitor) from vis),
    'newVisitors',     (select count(distinct visitor) from vis where is_new),
    'visits',          (select count(*) from vis),
    'fromShares',      (select count(*) from vis where story_id is not null),
    'impressions',     (select count(*) from imp),
    'viewers',         (select count(distinct visitor) from imp),
    'opens',           (select count(*) from ev where kind = 'open'),
    'openers',         (select count(distinct visitor) from ev where kind = 'open'),
    'saves',           (select count(*) from ev where kind = 'save'),
    'savers',          (select count(distinct visitor) from ev where kind = 'save'),
    'unsaves',         (select count(*) from ev where kind = 'unsave'),
    'shares',          (select count(*) from ev where kind = 'share'),
    'sharers',         (select count(distinct visitor) from ev where kind = 'share'),
    'clicks',          (select count(*) from ev where kind = 'link_click'),
    'entries',         (select count(*) from ev where kind = 'entry'),
    'createStarts',    (select count(distinct visitor) from tr where kind = 'create_start'),
    'checkouts',       (select count(*) from started),
    'paid',            (select count(*) from paid),
    'creators',        (select count(distinct coalesce(maker_email, visitor, id::text)) from paid),
    'newCreators',     (select count(distinct coalesce(p.maker_email, p.visitor, p.id::text)) from paid p
                         where not exists (select 1 from public.stories o
                                            where o.starts_at < p_from
                                              and coalesce(o.maker_email, o.visitor) = coalesce(p.maker_email, p.visitor))),
    'gross',           (select coalesce(sum(amount_total), 0) from paid),
    'refunds',         (select coalesce(sum(refund_amount), 0) from public.stories st
                         where st.refunded_at >= p_from and st.refunded_at < p_to and private.fd_story_ok(p_f, st)),
    'fees',            (select coalesce(sum(stripe_fee), 0) from paid),
    'disputes',        (select coalesce(sum(dispute_amount), 0) from public.stories st
                         where st.disputed_at >= p_from and st.disputed_at < p_to and private.fd_story_ok(p_f, st)),
    'liveSpots',       (select count(*) from public.stories st
                         where st.starts_at <= v_at and st.ends_at > v_at and st.removed_at is null
                           and private.fd_story_ok(p_f, st)),
    'accounts',        (select count(*) from public.profiles where created_at >= p_from and created_at < p_to),
    'reports',         (select count(*) from public.reports where created_at >= p_from and created_at < p_to),
    'cohort',          (select count(*) from cohort),
    'returned7',       (select count(*) from cohort c where exists (
                          select 1 from public.visits x where x.visitor = c.visitor
                             and x.at > c.first_at + interval '12 hours' and x.at <= c.first_at + interval '7 days'))
  ) into r;
  return r;
end $$;

/**
 * The same measures per hour or day, for charts. p_tz decides where days
 * begin. Returns [{ t, visitors, newVisitors, visits, opens, saves, shares,
 * clicks, impressions, fromShares, createStarts, checkouts, paid, gross }].
 */
create function public.fd_series(p_key text, p_from timestamptz, p_to timestamptz, p_bucket text,
                                 p_f jsonb default '{}', p_tz text default 'UTC')
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  vf boolean := private.fd_has_vf(p_f);
  sf boolean := p_f ?| array['lane', 'kind'];
  step interval := case p_bucket when 'hour' then interval '1 hour' else interval '1 day' end;
begin
  perform private.assert_server(p_key);
  return coalesce((
    with fv as (select x as visitor from private.fd_visitors(p_f, p_from, p_to) x where vf),
    b as (
      select g as t from generate_series(
        date_trunc(p_bucket, p_from at time zone p_tz), date_trunc(p_bucket, (p_to - interval '1 microsecond') at time zone p_tz), step) g
    ),
    vis as (select date_trunc(p_bucket, at at time zone p_tz) t, visitor, is_new, story_id from public.visits
             where at >= p_from and at < p_to and (not vf or visitor in (select visitor from fv))),
    ev as (select date_trunc(p_bucket, e.at at time zone p_tz) t, e.kind from public.events e join public.stories st on st.id = e.story_id
            where e.at >= p_from and e.at < p_to and (not vf or e.visitor in (select visitor from fv))
              and (not sf or private.fd_story_ok(p_f, st))),
    imp as (select date_trunc(p_bucket, i.at at time zone p_tz) t from public.impressions i join public.stories st on st.id = i.story_id
             where i.at >= p_from and i.at < p_to and (not vf or i.visitor in (select visitor from fv))
               and (not sf or private.fd_story_ok(p_f, st))),
    tr as (select date_trunc(p_bucket, at at time zone p_tz) t, visitor from public.track
            where kind = 'create_start' and at >= p_from and at < p_to and (not vf or visitor in (select visitor from fv))),
    st as (select date_trunc(p_bucket, s.created_at at time zone p_tz) tc,
                  date_trunc(p_bucket, s.starts_at at time zone p_tz) tp, s.starts_at, s.created_at, s.amount_total
             from public.stories s
            where ((s.created_at >= p_from and s.created_at < p_to) or (s.starts_at >= p_from and s.starts_at < p_to))
              and private.fd_story_ok(p_f, s) and (not vf or s.visitor in (select visitor from fv)))
    select jsonb_agg(jsonb_build_object(
      't', to_char(b.t, 'YYYY-MM-DD"T"HH24:MI'),
      'visitors', (select count(distinct visitor) from vis where vis.t = b.t),
      'newVisitors', (select count(distinct visitor) from vis where vis.t = b.t and is_new),
      'visits', (select count(*) from vis where vis.t = b.t),
      'fromShares', (select count(*) from vis where vis.t = b.t and story_id is not null),
      'opens', (select count(*) from ev where ev.t = b.t and kind = 'open'),
      'saves', (select count(*) from ev where ev.t = b.t and kind = 'save'),
      'shares', (select count(*) from ev where ev.t = b.t and kind = 'share'),
      'clicks', (select count(*) from ev where ev.t = b.t and kind = 'link_click'),
      'impressions', (select count(*) from imp where imp.t = b.t),
      'createStarts', (select count(distinct visitor) from tr where tr.t = b.t),
      'checkouts', (select count(*) from st where st.tc = b.t and st.created_at >= p_from),
      'paid', (select count(*) from st where st.tp = b.t and st.starts_at >= p_from),
      'gross', (select coalesce(sum(amount_total), 0) from st where st.tp = b.t and st.starts_at >= p_from)
    ) order by b.t) from b
  ), '[]'::jsonb);
end $$;

/** A breakdown by source, medium, device, country, landing or lane. */
create function public.fd_breakdown(p_key text, p_dim text, p_from timestamptz, p_to timestamptz, p_f jsonb default '{}')
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare vf boolean := private.fd_has_vf(p_f);
begin
  perform private.assert_server(p_key);
  if p_dim = 'lane' then
    return coalesce((
      with fv as (select x as visitor from private.fd_visitors(p_f, p_from, p_to) x where vf)
      select jsonb_agg(x order by x.lane) from (
        select l.id as lane, l.label,
          (select count(*) from public.spots sp join public.stories st on st.id = sp.story_id
            where sp.lane = l.id and sp.status = 'live' and st.hidden_at is null) as live,
          (select count(*) from public.events e join public.stories st on st.id = e.story_id
            where st.lane = l.id and e.kind = 'open' and e.at >= p_from and e.at < p_to
              and (not vf or e.visitor in (select visitor from fv))) as opens,
          (select count(*) from public.events e join public.stories st on st.id = e.story_id
            where st.lane = l.id and e.kind = 'save' and e.at >= p_from and e.at < p_to
              and (not vf or e.visitor in (select visitor from fv))) as saves,
          (select count(*) from public.events e join public.stories st on st.id = e.story_id
            where st.lane = l.id and e.kind = 'share' and e.at >= p_from and e.at < p_to
              and (not vf or e.visitor in (select visitor from fv))) as shares,
          (select count(*) from public.impressions i join public.stories st on st.id = i.story_id
            where st.lane = l.id and i.at >= p_from and i.at < p_to
              and (not vf or i.visitor in (select visitor from fv))) as impressions,
          (select count(*) from public.stories st where st.lane = l.id and st.starts_at >= p_from and st.starts_at < p_to) as paid,
          (select coalesce(sum(amount_total), 0) - coalesce(sum(refund_amount), 0) from public.stories st
            where st.lane = l.id and st.starts_at >= p_from and st.starts_at < p_to) as revenue
        from public.lanes l
      ) x
    ), '[]'::jsonb);
  end if;
  return coalesce((
    with fv as (select x as visitor from private.fd_visitors(p_f, p_from, p_to) x where vf)
    select jsonb_agg(x order by x.visitors desc, x.key) from (
      select k as key, count(distinct v.visitor) as visitors, count(*) as visits,
             count(*) filter (where v.is_new) as new_visits,
             (select count(*) from public.events e where e.kind = 'open' and e.at >= p_from and e.at < p_to
                and e.visitor in (select v2.visitor from public.visits v2
                                   where v2.at >= p_from and v2.at < p_to and
                                         case p_dim when 'source' then v2.source when 'medium' then coalesce(v2.medium, '(none)')
                                                    when 'device' then coalesce(v2.device, '(unknown)')
                                                    when 'country' then coalesce(v2.country, '(unknown)')
                                                    else case when v2.landing like '/s/%' then 'Shared spot link' else coalesce(v2.landing, '/') end end = k)) as opens
        from public.visits v,
             lateral (select case p_dim when 'source' then v.source when 'medium' then coalesce(v.medium, '(none)')
                                        when 'device' then coalesce(v.device, '(unknown)')
                                        when 'country' then coalesce(v.country, '(unknown)')
                                        else case when v.landing like '/s/%' then 'Shared spot link' else coalesce(v.landing, '/') end end as k) kk
       where v.at >= p_from and v.at < p_to and (not vf or v.visitor in (select visitor from fv))
       group by k
    ) x
  ), '[]'::jsonb);
end $$;

/**
 * Spots with their performance in the period: impressions, viewers, opens,
 * saves, shares, clicks, visits from their shared links, revenue.
 */
create function public.fd_spots(p_key text, p_from timestamptz, p_to timestamptz, p_f jsonb default '{}',
                                p_sort text default 'opens', p_q text default '', p_limit integer default 100,
                                p_offset integer default 0)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare vf boolean := private.fd_has_vf(p_f);
begin
  perform private.assert_server(p_key);
  return coalesce((
    with fv as (select x as visitor from private.fd_visitors(p_f, p_from, p_to) x where vf)
    select jsonb_agg(to_jsonb(x) order by case p_sort
        when 'saves' then x.saves when 'shares' then x.shares when 'impressions' then x.impressions
        when 'clicks' then x.clicks when 'revenue' then x.revenue when 'shareVisits' then x."shareVisits"
        else x.opens end desc, x."startsAt" desc)
    from (
      select st.id, st.slug, st.lane, st.spot_no as no, st.name, coalesce(st.maker_email, 'visitor ' || left(st.visitor, 8)) as creator,
             st.starts_at as "startsAt", st.ends_at as "endsAt",
             case when st.removed_at is not null then 'removed' when st.hidden_at is not null then 'hidden'
                  when st.ends_at > now() then 'live' else 'ended' end as status,
             (select count(*) from public.impressions i where i.story_id = st.id and i.at >= p_from and i.at < p_to
                and (not vf or i.visitor in (select visitor from fv))) as impressions,
             (select count(distinct visitor) from public.impressions i where i.story_id = st.id and i.at >= p_from and i.at < p_to
                and (not vf or i.visitor in (select visitor from fv))) as viewers,
             (select count(*) from public.events e where e.story_id = st.id and e.kind = 'open' and e.at >= p_from and e.at < p_to
                and (not vf or e.visitor in (select visitor from fv))) as opens,
             (select count(*) from public.events e where e.story_id = st.id and e.kind = 'save' and e.at >= p_from and e.at < p_to
                and (not vf or e.visitor in (select visitor from fv))) as saves,
             (select count(*) from public.events e where e.story_id = st.id and e.kind = 'share' and e.at >= p_from and e.at < p_to
                and (not vf or e.visitor in (select visitor from fv))) as shares,
             (select count(*) from public.events e where e.story_id = st.id and e.kind = 'link_click' and e.at >= p_from and e.at < p_to
                and (not vf or e.visitor in (select visitor from fv))) as clicks,
             (select count(*) from public.visits v where v.story_id = st.id and v.at >= p_from and v.at < p_to
                and (not vf or v.visitor in (select visitor from fv))) as "shareVisits",
             coalesce(st.amount_total, 0) - coalesce(st.refund_amount, 0) as revenue
        from public.stories st
       where st.starts_at is not null and private.fd_story_ok(p_f, st)
         and (coalesce(p_q, '') <> '' or (st.starts_at < p_to and st.ends_at > p_from))
         and (coalesce(p_q, '') = '' or st.name ilike '%' || p_q || '%' or st.slug = p_q
              or coalesce(st.maker_email, '') ilike '%' || p_q || '%')
    ) x
    limit least(greatest(p_limit, 1), 1000) offset greatest(p_offset, 0)
  ), '[]'::jsonb);
end $$;

/** One spot: the story, its totals, its hourly timeline, sources and recent events. */
create function public.fd_spot(p_key text, p_story uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare st public.stories;
begin
  perform private.assert_server(p_key);
  select * into st from public.stories where id = p_story;
  if not found then return null; end if;
  return jsonb_build_object(
    'story', jsonb_build_object('id', st.id, 'slug', st.slug, 'lane', st.lane, 'no', st.spot_no, 'name', st.name,
        'snippet', st.snippet, 'artwork', st.artwork_key, 'logo', st.logo_key, 'seed', st.seed, 'pal', st.pal,
        'creator', coalesce(st.maker_email, 'visitor ' || left(st.visitor, 8)), 'links', st.links,
        'createdAt', st.created_at, 'startsAt', st.starts_at, 'endsAt', st.ends_at,
        'amount', st.amount_total, 'refund', st.refund_amount, 'fee', st.stripe_fee, 'dispute', st.dispute_amount,
        'moderation', st.moderation,
        'status', case when st.removed_at is not null then 'removed' when st.hidden_at is not null then 'hidden'
                       when st.starts_at is null then 'unpaid' when st.ends_at > now() then 'live' else 'ended' end),
    'totals', jsonb_build_object(
        'impressions', (select count(*) from public.impressions where story_id = st.id),
        'viewers', (select count(distinct visitor) from public.impressions where story_id = st.id),
        'opens', (select count(*) from public.events where story_id = st.id and kind = 'open'),
        'openers', (select count(distinct visitor) from public.events where story_id = st.id and kind = 'open'),
        'saves', (select count(*) from public.events where story_id = st.id and kind = 'save'),
        'shares', (select count(*) from public.events where story_id = st.id and kind = 'share'),
        'clicks', (select count(*) from public.events where story_id = st.id and kind = 'link_click'),
        'entries', (select count(*) from public.events where story_id = st.id and kind = 'entry'),
        'shareVisits', (select count(*) from public.visits where story_id = st.id)),
    'timeline', coalesce((
        select jsonb_agg(jsonb_build_object('t', to_char(h, 'YYYY-MM-DD"T"HH24:MI'),
            'impressions', (select count(*) from public.impressions i where i.story_id = st.id and date_trunc('hour', i.at) = h),
            'opens', (select count(*) from public.events e where e.story_id = st.id and e.kind = 'open' and date_trunc('hour', e.at) = h),
            'saves', (select count(*) from public.events e where e.story_id = st.id and e.kind = 'save' and date_trunc('hour', e.at) = h),
            'shares', (select count(*) from public.events e where e.story_id = st.id and e.kind = 'share' and date_trunc('hour', e.at) = h),
            'clicks', (select count(*) from public.events e where e.story_id = st.id and e.kind = 'link_click' and date_trunc('hour', e.at) = h))
          order by h)
        from generate_series(date_trunc('hour', coalesce(st.starts_at, st.created_at)),
                             date_trunc('hour', least(coalesce(st.ends_at, now()), now())), interval '1 hour') h
    ), '[]'::jsonb),
    'sources', coalesce((
        select jsonb_agg(jsonb_build_object('key', source, 'visits', n) order by n desc)
          from (select source, count(*) n from public.visits where story_id = st.id group by source) s
    ), '[]'::jsonb),
    'events', coalesce((
        select jsonb_agg(jsonb_build_object('at', at, 'kind', kind, 'visitor', left(visitor, 6)) order by at desc)
          from (select at, kind, visitor from public.events where story_id = st.id order by at desc limit 200) e
    ), '[]'::jsonb)
  );
end $$;

/** Creators (makers of paid stories) with their spots, money and reach in the period. */
create function public.fd_creators(p_key text, p_from timestamptz, p_to timestamptz, p_f jsonb default '{}')
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_server(p_key);
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.revenue desc, x."lastAt" desc) from (
      select k.creator,
             count(*) as spots,
             count(*) filter (where k.starts_at >= p_from and k.starts_at < p_to) as "spotsInPeriod",
             min(k.starts_at) as "firstAt", max(k.starts_at) as "lastAt",
             coalesce(sum(k.amount_total) filter (where k.starts_at >= p_from and k.starts_at < p_to), 0)
               - coalesce(sum(k.refund_amount) filter (where k.starts_at >= p_from and k.starts_at < p_to), 0) as revenue,
             (select count(*) from public.events e join public.stories s2 on s2.id = e.story_id
               where coalesce(s2.maker_email, s2.visitor) = k.ck and e.kind = 'open' and e.at >= p_from and e.at < p_to) as opens,
             (select count(*) from public.events e join public.stories s2 on s2.id = e.story_id
               where coalesce(s2.maker_email, s2.visitor) = k.ck and e.kind = 'save' and e.at >= p_from and e.at < p_to) as saves,
             array_agg(distinct k.lane) as lanes
        from (select st.*, coalesce(st.maker_email, st.visitor) as ck,
                     coalesce(st.maker_email, 'visitor ' || left(st.visitor, 8)) as creator
                from public.stories st
               where st.starts_at is not null and st.starts_at < p_to and private.fd_story_ok(p_f, st)) k
       group by k.ck, k.creator
    ) x
  ), '[]'::jsonb);
end $$;

/** Where the Create flow loses people: distinct visitors reaching each step. */
create function public.fd_create_funnel(p_key text, p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_server(p_key);
  return jsonb_build_object(
    'started', (select count(distinct visitor) from public.track where kind = 'create_start' and at >= p_from and at < p_to),
    'steps', coalesce((select jsonb_agg(jsonb_build_object('step', step, 'visitors', n) order by step)
       from (select step, count(distinct visitor) n from public.track
              where kind = 'create_step' and at >= p_from and at < p_to group by step) s), '[]'::jsonb),
    'checkouts', (select count(*) from public.stories where created_at >= p_from and created_at < p_to),
    'paid', (select count(*) from public.stories where starts_at >= p_from and starts_at < p_to)
  );
end $$;

/** Transactions for the revenue page and its exports. */
create function public.fd_transactions(p_key text, p_from timestamptz, p_to timestamptz, p_f jsonb default '{}')
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_server(p_key);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', st.id, 'paidAt', st.starts_at, 'lane', st.lane, 'no', st.spot_no, 'name', st.name,
      'creator', coalesce(st.maker_email, 'visitor ' || left(st.visitor, 8)),
      'currency', coalesce(st.currency, 'usd'), 'amount', coalesce(st.amount_total, 0),
      'fee', st.stripe_fee, 'refund', coalesce(st.refund_amount, 0), 'refundedAt', st.refunded_at,
      'dispute', coalesce(st.dispute_amount, 0), 'disputeStatus', st.dispute_status,
      'net', coalesce(st.amount_total, 0) - coalesce(st.refund_amount, 0) - coalesce(st.stripe_fee, 0) - coalesce(st.dispute_amount, 0),
      'paymentIntent', st.payment_intent, 'session', st.stripe_session_id) order by st.starts_at desc)
    from public.stories st
   where st.starts_at >= p_from and st.starts_at < p_to and private.fd_story_ok(p_f, st)
  ), '[]'::jsonb);
end $$;

/**
 * Weekly cohorts by first visit: size, then the share active on day 1, within
 * 7 and within 30 days, and in each of the following 8 weeks.
 */
create function public.fd_cohorts(p_key text, p_weeks integer default 12, p_tz text default 'UTC') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_server(p_key);
  return coalesce((
    select jsonb_agg(x order by x.week) from (
      select to_char(w, 'YYYY-MM-DD') as week, count(*) as size,
             count(*) filter (where exists (select 1 from public.visits v where v.visitor = c.visitor
                and (v.at at time zone p_tz)::date = (c.first_at at time zone p_tz)::date + 1)) as d1,
             count(*) filter (where exists (select 1 from public.visits v where v.visitor = c.visitor
                and (v.at at time zone p_tz)::date between (c.first_at at time zone p_tz)::date + 1 and (c.first_at at time zone p_tz)::date + 7)) as d7,
             count(*) filter (where exists (select 1 from public.visits v where v.visitor = c.visitor
                and (v.at at time zone p_tz)::date between (c.first_at at time zone p_tz)::date + 1 and (c.first_at at time zone p_tz)::date + 30)) as d30,
             (select jsonb_agg((select count(*) from public.visitors c2
                  where date_trunc('week', c2.first_at at time zone p_tz) = w
                    and exists (select 1 from public.visits v where v.visitor = c2.visitor
                      and date_trunc('week', v.at at time zone p_tz) = w + (k || ' weeks')::interval)) order by k)
                from generate_series(1, 8) k
               where w + (k || ' weeks')::interval <= date_trunc('week', now() at time zone p_tz)) as weeks
        from public.visitors c, lateral (select date_trunc('week', c.first_at at time zone p_tz) as w) ww
       where c.first_at >= date_trunc('week', now() at time zone p_tz) at time zone p_tz - (p_weeks || ' weeks')::interval
       group by w
    ) x
  ), '[]'::jsonb);
end $$;

/**
 * The live feed: visits, story events, Create moments and payments since a
 * moment, newest first. Visitors appear only as where they came from.
 */
create function public.fd_feed(p_key text, p_since timestamptz, p_limit integer default 60) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_server(p_key);
  return coalesce((
    select jsonb_agg(x order by x.at desc) from (
      (select v.at, 'visit' as kind, v.source, v.device, v.country, v.is_new as "isNew",
              st.lane, st.spot_no as no, st.name, st.id as story, null::int as amount, null::int as step
         from public.visits v left join public.stories st on st.id = v.story_id
        where v.at > p_since order by v.at desc limit p_limit)
      union all
      (select e.at, e.kind, vv.source, vv.device, vv.country, null, st.lane, st.spot_no, st.name, st.id, null, null
         from public.events e join public.stories st on st.id = e.story_id
         left join public.visitors vv on vv.visitor = e.visitor
        where e.at > p_since order by e.at desc limit p_limit)
      union all
      (select t.at, t.kind, null, null, null, null, null, null, null, null, null, t.step
         from public.track t where t.at > p_since and t.kind <> 'client_error' order by t.at desc limit p_limit)
      union all
      (select st.created_at, 'checkout', null, null, null, null, st.lane, st.spot_no, st.name, st.id, st.amount_total, null
         from public.stories st where st.created_at > p_since order by st.created_at desc limit p_limit)
      union all
      (select st.starts_at, 'paid', null, null, null, null, st.lane, st.spot_no, st.name, st.id, st.amount_total, null
         from public.stories st where st.starts_at > p_since order by st.starts_at desc limit p_limit)
      order by 1 desc limit least(p_limit, 500)
    ) x
  ), '[]'::jsonb);
end $$;

/** Who is here right now: distinct visitors active in the last 5 minutes. */
create function public.fd_live(p_key text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_server(p_key);
  return jsonb_build_object(
    'now', (select count(distinct visitor) from (
              select visitor from public.visits where at > now() - interval '5 minutes'
              union select visitor from public.events where at > now() - interval '5 minutes'
              union select visitor from public.impressions where at > now() - interval '5 minutes'
              union select visitor from public.track where at > now() - interval '5 minutes') a),
    'lastEvent', greatest((select max(at) from public.events), (select max(at) from public.visits))
  );
end $$;

/** Health: requests and errors by hour (24h), routes, recent errors, webhooks, cron, database, ingestion. */
create function public.fd_ops(p_key text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_cron jsonb := '[]';
begin
  perform private.assert_server(p_key);
  begin
    execute $q$
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select j.jobname as name, j.schedule, j.active,
               (select jsonb_build_object('status', d.status, 'at', d.end_time, 'message', left(d.return_message, 200))
                  from cron.job_run_details d where d.jobid = j.jobid order by d.start_time desc limit 1) as last,
               (select count(*) from cron.job_run_details d where d.jobid = j.jobid and d.status <> 'succeeded'
                  and d.start_time > now() - interval '24 hours') as failed24h
          from cron.job j) x
    $q$ into v_cron;
  exception when others then v_cron := '[]';
  end;
  return jsonb_build_object(
    'hours', coalesce((select jsonb_agg(jsonb_build_object('t', to_char(h, 'YYYY-MM-DD"T"HH24:MI'),
        'requests', coalesce((select sum(n) from public.api_minute where date_trunc('hour', minute) = h), 0),
        'errors', coalesce((select sum(errors) from public.api_minute where date_trunc('hour', minute) = h), 0),
        'slow', coalesce((select sum(slow) from public.api_minute where date_trunc('hour', minute) = h), 0)) order by h)
      from generate_series(date_trunc('hour', now()) - interval '23 hours', date_trunc('hour', now()), interval '1 hour') h), '[]'::jsonb),
    'routes', coalesce((select jsonb_agg(r order by r.requests desc) from (
        select route, sum(n) as requests, sum(errors) as errors, sum(slow) as slow,
               round(sum(ms_sum)::numeric / nullif(sum(n), 0)) as "avgMs", max(ms_max) as "maxMs"
          from public.api_minute where minute > now() - interval '24 hours' group by route) r), '[]'::jsonb),
    'errors', coalesce((select jsonb_agg(to_jsonb(o) order by o.at desc) from (
        select at, kind, route, status, message from public.ops_log
         where not ok and at > now() - interval '7 days' order by at desc limit 50) o), '[]'::jsonb),
    'webhooks', jsonb_build_object(
        'ok24h', (select count(*) from public.ops_log where kind = 'webhook' and ok and at > now() - interval '24 hours'),
        'failed24h', (select count(*) from public.ops_log where kind = 'webhook' and not ok and at > now() - interval '24 hours'),
        'last', (select max(at) from public.ops_log where kind = 'webhook')),
    'uploads', jsonb_build_object(
        'failed24h', (select count(*) from public.ops_log where kind = 'upload' and not ok and at > now() - interval '24 hours')),
    'clientErrors24h', (select count(*) from public.track where kind = 'client_error' and at > now() - interval '24 hours'),
    'cron', v_cron,
    'database', jsonb_build_object(
        'bytes', pg_database_size(current_database()),
        'connections', (select count(*) from pg_stat_activity)),
    'ingestion', jsonb_build_object(
        'lastVisit', (select max(at) from public.visits),
        'lastEvent', (select max(at) from public.events),
        'lagMs', (select round(extract(epoch from percentile_cont(0.5) within group (order by at - client_at)) * 1000)
                    from public.visits where client_at is not null and at > now() - interval '1 hour'))
  );
end $$;

-- --------------------------------------------------------------- grants ---

do $$
declare f text;
begin
  foreach f in array array[
    'track_visit(text, jsonb)', 'track_event(text, text, text, integer, jsonb, timestamptz)',
    'track_impressions(text, text, uuid[])', 'log_api(text, text, integer, integer)',
    'log_ops(text, text, boolean, text, integer, integer, text, jsonb)', 'record_fee(text, uuid, integer)',
    'record_dispute(text, text, integer, text)', 'export_create(text, jsonb)', 'export_update(text, uuid, jsonb)',
    'export_list(text, integer)', 'export_get(text, uuid)',
    'fd_kpis(text, timestamptz, timestamptz, jsonb)', 'fd_series(text, timestamptz, timestamptz, text, jsonb, text)',
    'fd_breakdown(text, text, timestamptz, timestamptz, jsonb)',
    'fd_spots(text, timestamptz, timestamptz, jsonb, text, text, integer, integer)', 'fd_spot(text, uuid)',
    'fd_creators(text, timestamptz, timestamptz, jsonb)', 'fd_create_funnel(text, timestamptz, timestamptz)',
    'fd_transactions(text, timestamptz, timestamptz, jsonb)', 'fd_cohorts(text, integer, text)',
    'fd_feed(text, timestamptz, integer)', 'fd_live(text)', 'fd_ops(text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    -- callable, but useless without the server key
    execute format('grant execute on function public.%s to anon', f);
  end loop;
end $$;
revoke all on function private.fd_story_ok(jsonb, public.stories), private.fd_has_vf(jsonb),
  private.fd_visitors(jsonb, timestamptz, timestamptz) from public, anon, authenticated;
