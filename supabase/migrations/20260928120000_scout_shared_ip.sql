/*
 * Scout: a shared address is no longer enough to lose your standing (review
 * fix, docs/scout.md). Before, more than 3 accounts on one address in 30 days
 * made every one of them ineligible, which hits offices, campuses and
 * carriers. Now an address only counts together with co-ordination: accounts
 * there calling the same stories within minutes of each other, for a real
 * share of their calls. Addresses with very many browsers are no signal.
 * A browser shared by two accounts stays a hard signal. The only effect is
 * "not eligible this cycle"; nothing is shown to anyone.
 */

create or replace function private.scout_cfg() returns jsonb
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
    -- several accounts on one address are only a sign of gaming together with
    -- co-ordination: at least coordStories of the same stories, each called
    -- within coordMinutes of another account there, and at least coordShare of
    -- the account's counted calls. An address with more than ipCrowdVisitors
    -- browsers in 30 days (a carrier, a campus) is no signal at all.
    -- Hypotheses, to be tuned from real data.
    'coordStories', 3,
    'coordMinutes', 10,
    'coordShare', 0.30,
    'ipCrowdVisitors', 50,
    -- after signing in from a Timeheart, that one Timeheart can still count
    'promptMinutes', 30
  )
$$;
revoke all on function private.scout_cfg() from public, anon, authenticated;

create or replace function public.scout_recalc(p_key text) returns jsonb
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
  /* accounts seen on the same address in the last 30 days, not counting crowded addresses */
  ips as (
    select e.ip_hash, d.user_id from public.events e join public.scout_devices d on d.visitor = e.visitor
     where e.at > now() - interval '30 days' and e.ip_hash is not null
       and e.ip_hash not in (
         select e2.ip_hash from public.events e2
          where e2.at > now() - interval '30 days' and e2.ip_hash is not null
          group by e2.ip_hash having count(distinct e2.visitor) > (cfg ->> 'ipCrowdVisitors')::int)
     group by 1, 2
  ),
  neighbours as (
    select distinct a.user_id, b.user_id as other from ips a join ips b on b.ip_hash = a.ip_hash and b.user_id <> a.user_id
  ),
  /* of an account's counted calls, how many a neighbour called within coordMinutes */
  coordinated as (
    select nb.user_id, count(distinct c.story_id) as n
      from neighbours nb
      join public.scout_calls c on c.user_id = nb.user_id and c.scored
      join public.scout_calls x on x.user_id = nb.other and x.story_id = c.story_id
       and abs(extract(epoch from c.called_at - x.called_at)) <= (cfg ->> 'coordMinutes')::int * 60
     group by nb.user_id
  ),
  shared_ip as (
    select co.user_id from coordinated co
     where co.n >= (cfg ->> 'coordStories')::int
       and co.n >= (cfg ->> 'coordShare')::numeric
                   * (select count(*) from public.scout_calls c where c.user_id = co.user_id and c.scored)
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
