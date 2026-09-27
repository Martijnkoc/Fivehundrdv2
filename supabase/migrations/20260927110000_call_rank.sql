/*
 * Call it: which caller you were ("You were the 3rd to call this"). Derived
 * from the calls themselves (the order they were made), never stored, and
 * only ever shown to the caller: there is still no public count of calls.
 */
create function private.call_rank(c public.calls) returns integer
language sql stable set search_path = '' as $$
  select count(*)::int from public.calls x
   where x.story_id = c.story_id and (x.called_at < c.called_at or (x.called_at = c.called_at and x.visitor <= c.visitor))
$$;
revoke all on function private.call_rank(public.calls) from public, anon, authenticated;

create or replace function public.call_story(p_key text, p_visitor text, p_story uuid, p_ip_hash text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  st public.stories;
  c public.calls;
  h public.hotspots;
  n integer;
  cap integer := (private.retention_cfg() ->> 'callsPerDay')::int;
begin
  perform private.assert_server(p_key);
  select * into c from public.calls where visitor = p_visitor and story_id = p_story;
  if found then
    return jsonb_build_object('status', 'called', 'calledAt', c.called_at, 'rank', private.call_rank(c));
  end if;
  select st2.* into st from public.stories st2 join public.spots sp on sp.story_id = st2.id
   where st2.id = p_story and sp.status = 'live' and st2.ends_at > now()
     and st2.hidden_at is null and st2.removed_at is null;
  if not found then return jsonb_build_object('status', 'unavailable'); end if;
  if st.visitor = p_visitor then return jsonb_build_object('status', 'own'); end if;
  if st.hot_at is not null then return jsonb_build_object('status', 'hot'); end if;
  select count(*) into n from public.calls
   where visitor = p_visitor and called_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  if n >= cap then return jsonb_build_object('status', 'limit'); end if;
  select * into h from public.hotspots where story_id = p_story;
  insert into public.calls (visitor, story_id, lane, impressions, opens, saves, shares, clicks, score, rank, was_hot)
  values (p_visitor, p_story, st.lane,
          (select count(distinct visitor)::int from public.impressions where story_id = p_story),
          private.people(p_story, 'open', now()), private.people(p_story, 'save', now()),
          private.people(p_story, 'share', now()), private.people(p_story, 'link_click', now()),
          h.score, h.rank, false)
  on conflict do nothing
  returning * into c;
  if c.visitor is null then
    select * into c from public.calls where visitor = p_visitor and story_id = p_story;
    return jsonb_build_object('status', 'called', 'calledAt', c.called_at, 'rank', private.call_rank(c));
  end if;
  perform public.record_event(p_key, p_story, 'save', p_visitor, p_ip_hash);
  return jsonb_build_object('status', 'called', 'calledAt', c.called_at, 'rank', private.call_rank(c), 'left', cap - n - 1);
end $$;

create or replace function public.finds_status(p_key text, p_visitor text, p_stories uuid[]) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare cfg jsonb := private.retention_cfg();
begin
  perform private.assert_server(p_key);
  return coalesce((
    with mine as (
      select st.*, (select min(e.at) from public.events e where e.story_id = st.id and e.kind = 'save' and e.visitor = p_visitor) as saved_at
        from public.stories st
       where st.id = any (p_stories[1:200]) and st.starts_at is not null
    ),
    firsts as (
      select e.story_id, e.visitor, min(e.at) as at
        from public.events e where e.kind = 'save' and e.story_id in (select id from mine)
       group by e.story_id, e.visitor
    ),
    ranked as (
      select m.id,
             (select count(*)::int from firsts f where f.story_id = m.id and f.at <= m.saved_at) as rank,
             (select count(*)::int from firsts f where f.story_id = m.id) as savers
        from mine m
    )
    select jsonb_agg(jsonb_build_object(
      'id', m.id,
      'savedAt', m.saved_at,
      'rank', r.rank,
      'savers', r.savers,
      'saves', m.saves,
      'hotAt', m.hot_at,
      'endsAt', m.ends_at,
      'gone', m.ends_at <= now() or m.hidden_at is not null or m.removed_at is not null,
      'early', m.saved_at is not null and (
        (m.hot_at is not null and m.saved_at < m.hot_at)
        or (r.savers >= (cfg ->> 'earlyMinSavers')::int
            and (r.rank - 0.5) / nullif(r.savers, 0) <= (cfg ->> 'earlyShare')::numeric
            and (m.ends_at <= now() or r.savers >= (cfg ->> 'earlyGrowth')::int * r.rank))),
      'call', (select jsonb_build_object('calledAt', c.called_at, 'outcome', c.outcome, 'outcomeAt', c.outcome_at, 'savesThen', c.saves,
                                         'rank', private.call_rank(c))
                 from public.calls c where c.visitor = p_visitor and c.story_id = m.id),
      'back', (select jsonb_build_object('id', b.id, 'lane', b.lane, 'no', b.spot_no, 'slug', b.slug, 'name', b.name)
                 from public.stories b join public.spots sp on sp.story_id = b.id and sp.status = 'live'
                where b.id <> m.id and b.starts_at > m.starts_at and b.ends_at > now()
                  and b.hidden_at is null and b.removed_at is null
                  and private.maker_key(b.maker_email, b.visitor) = private.maker_key(m.maker_email, m.visitor)
                order by b.starts_at desc limit 1)
    ))
      from mine m join ranked r on r.id = m.id
     where m.saved_at is not null or exists (select 1 from public.calls c where c.visitor = p_visitor and c.story_id = m.id)
  ), '[]'::jsonb);
end $$;
