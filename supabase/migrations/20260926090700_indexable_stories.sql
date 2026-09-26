/*
 * Discoveries for the sitemap: every story's lasting link that may be
 * indexed. Paid (started), not hidden, not removed; live or ended. Only
 * public fields, so it's callable without the server key, like story_public().
 */
create function public.stories_indexable(p_offset integer default 0, p_limit integer default 50000) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('lane', x.lane, 'no', x.spot_no, 'slug', x.slug, 'at', x.at) order by x.starts_at, x.id), '[]'::jsonb)
  from (
    select st.id, st.lane, st.spot_no, st.slug, st.starts_at, least(st.ends_at, now()) as at
      from public.stories st
     where st.starts_at is not null and st.starts_at <= now() and st.hidden_at is null and st.removed_at is null
     order by st.starts_at, st.id
     offset greatest(p_offset, 0) limit least(greatest(p_limit, 1), 50000)
  ) x
$$;

create function public.stories_indexable_count() returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.stories st
   where st.starts_at is not null and st.starts_at <= now() and st.hidden_at is null and st.removed_at is null
$$;

revoke all on function public.stories_indexable(integer, integer), public.stories_indexable_count() from public, anon, authenticated;
grant execute on function public.stories_indexable(integer, integer), public.stories_indexable_count() to anon, authenticated;
