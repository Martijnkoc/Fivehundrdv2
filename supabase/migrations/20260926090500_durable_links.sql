-- Share links that last (§15): every story gets its own short code, so
-- /s/music/217/k3f9x2ab keeps pointing at this story after its 72 hours,
-- when No. 217 belongs to someone else.

create function private.new_slug() returns text
language sql volatile set search_path = '' as $$
  -- 8 characters without look-alikes (no 0/o, 1/l/i): 31^8 codes
  select string_agg(substr('abcdefghjkmnpqrstuvwxyz23456789', 1 + floor(random() * 31)::int, 1), '')
    from generate_series(1, 8)
$$;

alter table public.stories add column slug text not null default private.new_slug();
alter table public.stories add constraint stories_slug_key unique (slug);

/** The wall now carries each story's code. */
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

/**
 * One story by its code, for its lasting link: live now, or ended (still
 * showing who it was and where to find them). Hidden, removed and unpaid
 * stories aren't shown. Returns the story plus 'state', or null.
 */
create function public.story_public(p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', st.id, 'slug', st.slug, 'lane', st.lane, 'no', st.spot_no, 'name', st.name, 'snippet', st.snippet,
    'artwork', st.artwork_key, 'logo', st.logo_key, 'audio', st.audio_key, 'audioEmbed', st.audio_embed_url,
    'excerptTitle', st.excerpt_title, 'excerpt', st.excerpt,
    'trailerUrl', st.trailer_url, 'trailerLen', st.trailer_len,
    'links', st.links, 'seed', st.seed, 'pal', st.pal,
    'startsAt', st.starts_at, 'endsAt', st.ends_at, 'opens', st.opens, 'saves', st.saves,
    'state', case when sp.status = 'live' and st.ends_at > now() then 'live' else 'ended' end
  )
  from public.stories st left join public.spots sp on sp.story_id = st.id
  where st.slug = p_slug and st.starts_at is not null and st.hidden_at is null and st.removed_at is null
$$;

revoke all on function private.new_slug() from public, anon, authenticated;
revoke all on function public.story_public(text) from public, anon, authenticated;
grant execute on function public.story_public(text) to anon, authenticated;
