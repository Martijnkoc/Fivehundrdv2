/*
 * The copy pass (docs/copy.md): what the first screen may say, and the calls
 * to action it measures.
 *
 * Today on Fivehundrd: two real numbers for the day so far (UTC), public and
 * cached for 30 seconds by /api/today. Visitors are distinct browsers that
 * visited (bots are never recorded); discoveries opened are opens, each
 * counted once per visitor, story and day. Neither is a promise of reach.
 */
create function public.today_public() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'day', (now() at time zone 'UTC')::date,
    'visitors', (select count(distinct visitor) from public.visits
                  where at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'),
    'opened', (select count(*) from public.events
                where kind = 'open' and at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'))
$$;
revoke all on function public.today_public() from public, anon, authenticated;
grant execute on function public.today_public() to anon, authenticated;

/* when a call's verdict was reached, so "You called it early" is only said once it's settled */
create or replace function private.scout_call_json(c public.scout_calls) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', st.id, 'lane', st.lane, 'no', st.spot_no, 'name', st.name, 'slug', st.slug,
    'artwork', st.artwork_key, 'logo', st.logo_key, 'seed', st.seed, 'pal', st.pal,
    'startsAt', st.starts_at, 'endsAt', st.ends_at,
    'gone', st.ends_at <= now() or st.hidden_at is not null or st.removed_at is not null,
    'calledAt', c.called_at, 'source', c.source, 'scored', c.scored,
    'position', c.position, 'keepersThen', c.keepers_before, 'keepersNow', st.saves, 'wasHot', c.was_hot,
    'breakout', c.breakout, 'breakoutAt', c.breakout_at, 'finalKeepers', c.final_keepers,
    'early', c.early, 'settled', c.settled_at is not null, 'settledAt', c.settled_at, 'hidden', c.hidden_at is not null)
  from public.stories st where st.id = c.story_id
$$;
revoke all on function private.scout_call_json(public.scout_calls) from public, anon, authenticated;

/* the first screen's calls to action (the Scout ones already exist: scout_prompt_*, scout_signed_in, scout_card_share) */
alter table public.track drop constraint track_kind_check;
alter table public.track add constraint track_kind_check
  check (kind in ('create_start', 'create_step', 'client_error', 'since_shown', 'since_tap', 'hot_tap', 'new_tap',
                  'scout_prompt_shown', 'scout_prompt_tap', 'scout_signed_in', 'scout_card_view', 'scout_card_share',
                  'scout_call_share', 'scout_move_seen', 'scout_breakout_seen',
                  'hero_explore_wall_clicked', 'hero_creator_cta_clicked', 'live_proof_creator_cta_clicked',
                  'scout_explainer_cta_clicked', 'open_spot_clicked', 'creator_place_clicked'));

create or replace function public.track_surface(p_key text, p_visitor text, p_kind text, p_story uuid default null, p_props jsonb default null)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_server(p_key);
  if p_kind not in ('since_shown', 'since_tap', 'hot_tap', 'new_tap',
                    'scout_prompt_shown', 'scout_prompt_tap', 'scout_signed_in', 'scout_card_view', 'scout_card_share',
                    'scout_call_share', 'scout_move_seen', 'scout_breakout_seen',
                    'hero_explore_wall_clicked', 'hero_creator_cta_clicked', 'live_proof_creator_cta_clicked',
                    'scout_explainer_cta_clicked', 'open_spot_clicked', 'creator_place_clicked') then
    return false;
  end if;
  if (select count(*) from public.track where visitor = p_visitor and at > now() - interval '1 hour') >= 200 then
    return false;
  end if;
  insert into public.track (visitor, kind, story_id, props)
  values (left(p_visitor, 64), p_kind, (select id from public.stories where id = p_story), p_props);
  return true;
end $$;
