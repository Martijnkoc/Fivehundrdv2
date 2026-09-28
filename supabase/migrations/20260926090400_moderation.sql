-- Keeping the wall safe: automatic checks before payment, reports from
-- visitors, hiding and removing stories, refunds, and limits on holding
-- spots and uploading files. Everything here is called by the app's server
-- with the server key; the admin screen goes through the same server.

-- ------------------------------------------------------------- stories ---

alter table public.stories
  -- who started the checkout (a salted hash, never the address)
  add column ip_hash        text,
  -- the automatic check before payment: {verdict, categories, reason, links, by, at}
  add column moderation     jsonb,
  -- hidden: off the wall while someone looks at it; the spot stays taken
  add column hidden_at      timestamptz,
  add column hidden_reason  text,
  -- a person looked and kept it (reports before this are settled)
  add column reviewed_at    timestamptz,
  -- removed: off the wall for good, the number is free again
  add column removed_at     timestamptz,
  add column removed_reason text,
  -- the payment, from Stripe
  add column payment_intent text,
  add column amount_total   integer check (amount_total >= 0),
  add column currency       text,
  add column refunded_at    timestamptz,
  add column refund_amount  integer check (refund_amount >= 0);

create index stories_ip_hash_idx on public.stories (ip_hash, created_at);
create index stories_attention_idx on public.stories (created_at)
  where hidden_at is not null or (moderation ->> 'verdict') in ('review', 'unscanned');

-- ------------------------------------------------------------- reports ---

create table public.reports (
  id          bigint generated always as identity primary key,
  story_id    uuid not null references public.stories (id) on delete cascade,
  reason      text not null check (reason in ('sexual', 'child', 'scam', 'hate', 'violence', 'illegal', 'copyright', 'spam', 'other')),
  note        text check (char_length(note) <= 500),
  email       text check (char_length(email) <= 200),
  visitor     text,
  ip_hash     text not null,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolution  text check (resolution in ('kept', 'removed')),
  -- one report per story per person
  unique (story_id, ip_hash)
);
create index reports_open_idx on public.reports (story_id) where resolved_at is null;
create index reports_ip_hash_idx on public.reports (ip_hash, created_at);

-- --------------------------------------------------------- upload limit ---

create table public.upload_log (
  id      bigint generated always as identity primary key,
  ip_hash text not null,
  at      timestamptz not null default now()
);
create index upload_log_ip_hash_at_idx on public.upload_log (ip_hash, at);

alter table public.reports    enable row level security;
alter table public.upload_log enable row level security;
revoke all on public.reports, public.upload_log from anon, authenticated;

-- Files now go up through upload links the server hands out (with a limit),
-- so visitors can no longer write to Storage directly.
drop policy if exists "visitors upload draft media" on storage.objects;

-- ----------------------------------------------------------- the wall ---

/** Live stories that aren't hidden, and which numbers are held. */
create or replace function public.wall_public() returns jsonb
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
      where sp.status = 'live' and st.ends_at > now() and st.hidden_at is null
    ), '[]'::jsonb),
    'held', coalesce((
      select jsonb_agg(jsonb_build_array(lane, no) order by lane, no)
      from public.spots where status = 'reserved'
    ), '[]'::jsonb)
  )
$$;

/** A signed-in visitor's saves, without hidden or removed stories. */
create or replace function public.my_saves() returns jsonb
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
  where st.hidden_at is null and st.removed_at is null
$$;

-- ------------------------------------------------------------ checkout ---

/**
 * As before, plus limits per person (by IP hash): at most 3 spots held at
 * once and 10 checkouts started an hour, so nobody can hold the wall hostage.
 * p_story.ipHash and p_story.moderation are stored with the story.
 */
create or replace function public.checkout_reserve(p_key text, p_story jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_lane text := p_story ->> 'lane';
  v_no   smallint := (p_story ->> 'no')::smallint;
  v_ip   text := nullif(p_story ->> 'ipHash', '');
  v_id   uuid;
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
      ip_hash, moderation
    ) values (
      v_lane, v_no, p_story ->> 'name', nullif(p_story ->> 'snippet', ''),
      nullif(p_story ->> 'artwork', ''), nullif(p_story ->> 'logo', ''), nullif(p_story ->> 'audio', ''),
      nullif(p_story ->> 'excerptTitle', ''), nullif(p_story ->> 'excerpt', ''),
      nullif(p_story ->> 'trailerUrl', ''), nullif(p_story ->> 'trailerLen', ''),
      p_story -> 'links', (p_story ->> 'seed')::bigint, (p_story ->> 'pal')::smallint,
      nullif(p_story ->> 'email', ''), nullif(p_story ->> 'visitor', ''),
      v_ip, p_story -> 'moderation'
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

/** Paid: the spot goes live for 72 hours and the payment is kept with the story. Idempotent. */
drop function public.checkout_complete(text, uuid);
create function public.checkout_complete(
  p_key text, p_story uuid,
  p_payment_intent text default null, p_amount integer default null, p_currency text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  perform private.assert_server(p_key);
  update public.stories
     set payment_intent = coalesce(p_payment_intent, payment_intent),
         amount_total   = coalesce(p_amount, amount_total),
         currency       = coalesce(p_currency, currency)
   where id = p_story;
  with live as (
    update public.stories
       set starts_at = now(), ends_at = now() + interval '72 hours'
     where id = p_story and starts_at is null and removed_at is null
       and exists (select 1 from public.spots where story_id = p_story and status = 'reserved')
    returning id
  )
  update public.spots set status = 'live', reserved_until = null
   where story_id in (select id from live)
  returning jsonb_build_object('lane', lane, 'no', no) into v;
  return v;
end $$;

/** Where a checkout stands, including whether it was paid and refunded. */
create or replace function public.checkout_status(p_key text, p_story uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_server(p_key);
  return (
    select jsonb_build_object('status', case when st.removed_at is not null then 'removed' else coalesce(sp.status, 'released') end,
                              'lane', st.lane, 'no', st.spot_no,
                              'name', st.name, 'startsAt', st.starts_at, 'endsAt', st.ends_at,
                              'session', st.stripe_session_id, 'paymentIntent', st.payment_intent,
                              'amount', st.amount_total, 'refunded', st.refunded_at is not null)
      from public.stories st left join public.spots sp on sp.story_id = st.id
     where st.id = p_story
  );
end $$;

/** Hidden and removed stories aren't counted. */
create or replace function public.record_event(p_key text, p_story uuid, p_kind text, p_visitor text, p_ip_hash text) returns boolean
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

-- ------------------------------------------------------------- uploads ---

/** Hands out an upload: at most 15 files an hour per person. */
create function public.issue_upload(p_key text, p_ip_hash text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_server(p_key);
  if (select count(*) from public.upload_log where ip_hash = p_ip_hash and at > now() - interval '1 hour') >= 15 then
    return false;
  end if;
  insert into public.upload_log (ip_hash) values (p_ip_hash);
  return true;
end $$;

/** Which of these stored files a paid (or still payable) story uses; the rest can go. */
create function public.media_in_use(p_key text, p_paths text[]) returns text[]
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_server(p_key);
  return coalesce((
    select array_agg(distinct p) from unnest(p_paths) p
     where exists (
       select 1 from public.stories st left join public.spots sp on sp.story_id = st.id
        where (st.starts_at is not null or sp.status = 'reserved')
          and p in (st.artwork_key, st.logo_key, st.audio_key)
     )
  ), '{}');
end $$;

-- ------------------------------------------------------------- reports ---

/**
 * A visitor reports a story. Three people reporting it (or one report of a
 * child being put at risk) takes it off the wall until someone looks.
 * Returns { ok, hidden }.
 */
create function public.report_story(
  p_key text, p_story uuid, p_reason text, p_note text, p_email text, p_visitor text, p_ip_hash text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_story public.stories;
  v_open  integer;
begin
  perform private.assert_server(p_key);
  select * into v_story from public.stories where id = p_story and starts_at is not null and removed_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'hidden', false);
  end if;
  if (select count(*) from public.reports where ip_hash = p_ip_hash and created_at > now() - interval '1 day') >= 20 then
    return jsonb_build_object('ok', false, 'hidden', v_story.hidden_at is not null);
  end if;
  insert into public.reports (story_id, reason, note, email, visitor, ip_hash)
  values (p_story, p_reason, nullif(left(p_note, 500), ''), nullif(left(p_email, 200), ''), p_visitor, p_ip_hash)
  on conflict (story_id, ip_hash) do nothing;
  select count(*) into v_open from public.reports
   where story_id = p_story and resolved_at is null
     and created_at > coalesce(v_story.reviewed_at, '-infinity');
  if v_story.hidden_at is null and (v_open >= 3 or p_reason = 'child') then
    update public.stories set hidden_at = now(), hidden_reason = 'reported' where id = p_story;
    return jsonb_build_object('ok', true, 'hidden', true);
  end if;
  return jsonb_build_object('ok', true, 'hidden', v_story.hidden_at is not null);
end $$;

-- --------------------------------------------------------------- admin ---

/** The numbers on the admin screen. Money is in cents, net of refunds. */
create function public.admin_overview(p_key text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_today timestamptz := date_trunc('day', now());
begin
  perform private.assert_server(p_key);
  return jsonb_build_object(
    'live', (select count(*) from public.spots sp join public.stories st on st.id = sp.story_id
              where sp.status = 'live' and st.hidden_at is null),
    'held', (select count(*) from public.spots where status = 'reserved'),
    'hidden', (select count(*) from public.spots sp join public.stories st on st.id = sp.story_id
                where sp.status = 'live' and st.hidden_at is not null),
    'attention', (select count(*) from public.stories st
                   where st.starts_at is not null and st.removed_at is null and st.ends_at > now()
                     and (st.hidden_at is not null
                          or (st.reviewed_at is null and (st.moderation ->> 'verdict') in ('review', 'unscanned'))
                          or exists (select 1 from public.reports r where r.story_id = st.id and r.resolved_at is null))),
    'openReports', (select count(*) from public.reports where resolved_at is null),
    'lanes', (select jsonb_object_agg(l.id, (select count(*) from public.spots sp where sp.lane = l.id and sp.status = 'live'))
                from public.lanes l),
    'revenue', (select jsonb_build_object(
        'today', coalesce(sum(net) filter (where starts_at >= v_today), 0),
        'week',  coalesce(sum(net) filter (where starts_at >= now() - interval '7 days'), 0),
        'month', coalesce(sum(net) filter (where starts_at >= now() - interval '30 days'), 0),
        'all',   coalesce(sum(net), 0),
        'sales', count(*),
        'refunds', coalesce(sum(refund_amount), 0),
        'currency', coalesce(max(currency), 'usd'))
      from (select starts_at, currency, refund_amount,
                   coalesce(amount_total, 0) - coalesce(refund_amount, 0) as net
              from public.stories where starts_at is not null) paid)
  );
end $$;

/**
 * Stories for the admin screen, newest first.
 * p_filter: 'attention' | 'live' | 'removed' | 'all'. p_query matches name, email or link.
 */
create function public.admin_stories(p_key text, p_filter text, p_query text, p_limit integer default 50, p_offset integer default 0)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_server(p_key);
  return coalesce((
    select jsonb_agg(row_to_json(x)::jsonb order by x."sort" desc)
    from (
      select st.id, st.lane, st.spot_no as "no", st.name, st.snippet, st.links,
             st.artwork_key as artwork, st.logo_key as logo, st.audio_key as audio,
             st.excerpt_title as "excerptTitle", st.excerpt, st.trailer_url as "trailerUrl",
             st.maker_email as email, st.created_at as "createdAt", st.starts_at as "startsAt", st.ends_at as "endsAt",
             st.opens, st.saves, st.moderation, st.hidden_at as "hiddenAt", st.hidden_reason as "hiddenReason",
             st.reviewed_at as "reviewedAt", st.removed_at as "removedAt", st.removed_reason as "removedReason",
             st.amount_total as amount, st.currency, st.refunded_at as "refundedAt", st.refund_amount as "refundAmount",
             (st.payment_intent is not null) as paid,
             case when st.removed_at is not null then 'removed'
                  when sp.status = 'reserved' then 'held'
                  when sp.status = 'live' and st.ends_at > now() then 'live'
                  when st.starts_at is not null then 'ended'
                  else 'unpaid' end as status,
             (select count(*) from public.reports r where r.story_id = st.id and r.resolved_at is null) as "openReports",
             (select count(*) from public.reports r where r.story_id = st.id) as reports,
             coalesce(st.starts_at, st.created_at) as "sort"
        from public.stories st left join public.spots sp on sp.story_id = st.id
       where (st.starts_at is not null or sp.status = 'reserved')
         and case p_filter
               when 'attention' then st.removed_at is null and st.ends_at > now()
                 and (st.hidden_at is not null
                      or (st.reviewed_at is null and (st.moderation ->> 'verdict') in ('review', 'unscanned'))
                      or exists (select 1 from public.reports r where r.story_id = st.id and r.resolved_at is null))
               when 'live' then sp.status = 'live' and st.ends_at > now() and st.removed_at is null
               when 'removed' then st.removed_at is not null
               else true end
         and (coalesce(p_query, '') = ''
              or st.name ilike '%' || p_query || '%'
              or st.maker_email ilike '%' || p_query || '%'
              or st.links::text ilike '%' || p_query || '%'
              or st.id::text = p_query)
       order by coalesce(st.starts_at, st.created_at) desc
       limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0)
    ) x
  ), '[]'::jsonb);
end $$;

create function public.admin_reports(p_key text, p_story uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_server(p_key);
  return coalesce((
    select jsonb_agg(jsonb_build_object('reason', reason, 'note', note, 'email', email, 'at', created_at,
                                        'resolvedAt', resolved_at, 'resolution', resolution) order by created_at desc)
      from public.reports where story_id = p_story
  ), '[]'::jsonb);
end $$;

/** Takes a story off the wall for now (or puts it back); the spot stays taken. */
create function public.admin_hide(p_key text, p_story uuid, p_hidden boolean, p_reason text default null) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_server(p_key);
  update public.stories
     set hidden_at = case when p_hidden then coalesce(hidden_at, now()) end,
         hidden_reason = case when p_hidden then coalesce(p_reason, 'admin') end
   where id = p_story and removed_at is null;
  return found;
end $$;

/** Looked at and fine: back on the wall, open reports settled as kept. */
create function public.admin_approve(p_key text, p_story uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_server(p_key);
  update public.stories set reviewed_at = now(), hidden_at = null, hidden_reason = null
   where id = p_story and removed_at is null;
  if not found then return false; end if;
  update public.reports set resolved_at = now(), resolution = 'kept'
   where story_id = p_story and resolved_at is null;
  return true;
end $$;

/**
 * Off the wall for good: the number is free again and open reports are
 * settled as removed. Returns what the server needs to end the checkout and
 * refund: { session, paymentIntent, amount, refunded }.
 */
create function public.admin_remove(p_key text, p_story uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v public.stories;
begin
  perform private.assert_server(p_key);
  update public.stories set removed_at = coalesce(removed_at, now()), removed_reason = coalesce(p_reason, removed_reason)
   where id = p_story returning * into v;
  if not found then return null; end if;
  update public.spots set status = 'vacant', reserved_until = null, story_id = null
   where story_id = p_story;
  update public.reports set resolved_at = now(), resolution = 'removed'
   where story_id = p_story and resolved_at is null;
  return jsonb_build_object('session', v.stripe_session_id, 'paymentIntent', v.payment_intent,
                            'amount', v.amount_total, 'refunded', v.refunded_at is not null);
end $$;

/** A refund went through at Stripe. */
create function public.record_refund(p_key text, p_story uuid, p_amount integer) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_server(p_key);
  update public.stories
     set refunded_at = now(), refund_amount = coalesce(refund_amount, 0) + p_amount
   where id = p_story;
  return found;
end $$;

-- --------------------------------------------------------------- grants ---

revoke all on function
  public.checkout_complete(text, uuid, text, integer, text),
  public.issue_upload(text, text), public.media_in_use(text, text[]),
  public.report_story(text, uuid, text, text, text, text, text),
  public.admin_overview(text), public.admin_stories(text, text, text, integer, integer),
  public.admin_reports(text, uuid), public.admin_hide(text, uuid, boolean, text),
  public.admin_approve(text, uuid), public.admin_remove(text, uuid, text),
  public.record_refund(text, uuid, integer)
  from public, anon, authenticated;
-- server functions: callable, but useless without the server key
grant execute on function
  public.checkout_complete(text, uuid, text, integer, text),
  public.issue_upload(text, text), public.media_in_use(text, text[]),
  public.report_story(text, uuid, text, text, text, text, text),
  public.admin_overview(text), public.admin_stories(text, text, text, integer, integer),
  public.admin_reports(text, uuid), public.admin_hide(text, uuid, boolean, text),
  public.admin_approve(text, uuid), public.admin_remove(text, uuid, text),
  public.record_refund(text, uuid, integer)
  to anon;
