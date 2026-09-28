/*
 * For makers: how their own spot is doing, and two emails about it.
 *
 *   maker_stats   what the maker sees in "Your story" on their card: how many
 *                 people saw the tile, opened it, keep it, went to their links
 *                 and shared it, and when it became a Hotspot. People, not
 *                 clicks; the maker's own activity doesn't count. Only for the
 *                 browser that paid for the story.
 *   notices       "Your spot is a Hotspot" and "6 hours left", to the address
 *                 given at checkout, once each per story, with a link to stop
 *                 them for that spot. Sent by /api/cron/reminders.
 *
 * Provenance, not competition: a maker sees their own numbers, never a rank
 * among makers.
 */

alter table public.stories add column notify_off timestamptz;

create table public.maker_notices (
  story_id uuid not null references public.stories (id) on delete cascade,
  kind     text not null check (kind in ('hot', 'ending')),
  sent_at  timestamptz not null default now(),
  primary key (story_id, kind)
);
alter table public.maker_notices enable row level security;
revoke all on public.maker_notices from public, anon, authenticated;

/** One story's numbers so far, people only, without its maker. */
create function private.maker_numbers(st public.stories) returns jsonb
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
    'hotAt', st.hot_at
  )
$$;

/** "Your story": the numbers of the stories this browser paid for. */
create function public.maker_stats(p_key text, p_visitor text, p_stories uuid[]) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_server(p_key);
  return coalesce((
    select jsonb_agg(private.maker_numbers(st) || jsonb_build_object('id', st.id))
      from public.stories st
     where st.id = any (p_stories[1:20]) and st.visitor = p_visitor and st.starts_at is not null
  ), '[]'::jsonb);
end $$;

/** What makers should hear about: became a Hotspot (in the last day), or 6 hours left. */
create function public.maker_notices_due(p_key text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_server(p_key);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'story', st.id, 'kind', k.kind, 'email', st.maker_email, 'name', st.name, 'lane', st.lane,
             'no', st.spot_no, 'slug', st.slug, 'endsAt', st.ends_at, 'stats', private.maker_numbers(st)))
      from public.stories st
      join public.spots sp on sp.story_id = st.id and sp.status = 'live'
      cross join lateral (values ('hot'), ('ending')) k(kind)
     where st.maker_email is not null and st.notify_off is null
       and st.hidden_at is null and st.removed_at is null
       and ((k.kind = 'hot' and st.hot_at is not null and st.hot_at > now() - interval '1 day')
            or (k.kind = 'ending' and st.ends_at <= now() + interval '6 hours' and st.ends_at > now() + interval '1 hour'))
       and not exists (select 1 from public.maker_notices n where n.story_id = st.id and n.kind = k.kind)
  ), '[]'::jsonb);
end $$;

create function public.maker_notice_sent(p_key text, p_story uuid, p_kind text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_server(p_key);
  insert into public.maker_notices (story_id, kind) values (p_story, p_kind) on conflict do nothing;
  return found;
end $$;

/** The "stop these emails for this spot" link. */
create function public.maker_notices_off(p_key text, p_story uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_server(p_key);
  update public.stories set notify_off = coalesce(notify_off, now()) where id = p_story;
  return found;
end $$;

revoke all on function private.maker_numbers(public.stories) from public, anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array['maker_stats(text, text, uuid[])', 'maker_notices_due(text)', 'maker_notice_sent(text, uuid, text)',
                           'maker_notices_off(text, uuid)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to anon', f);
  end loop;
end $$;
