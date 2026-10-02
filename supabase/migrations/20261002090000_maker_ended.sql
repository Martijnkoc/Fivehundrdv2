/*
 * After the 72 hours (founder's ask, 2026-10-02): a maker sees how their
 * spot did in the site itself, no email needed, and can put the same story
 * on the wall again (a new spot and 72 hours, paid again; nothing renews by
 * itself).
 *
 * maker_ended returns a maker's stories that ended in the last 30 days, the
 * newest first (at most five), with their final numbers and what the Create
 * form needs to start from them. For the browser that paid (its visitor id
 * and the story ids it keeps), or for a signed-in account whose email is
 * the one given at checkout. Hidden and removed stories aren't offered.
 */
create function public.maker_ended(p_key text, p_visitor text, p_stories uuid[], p_user uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_email text;
begin
  perform private.assert_server(p_key);
  if p_user is not null then
    select lower(email) into v_email from auth.users where id = p_user;
  end if;
  return coalesce((
    select jsonb_agg(x.j order by x.ends_at desc) from (
      select st.ends_at, jsonb_build_object(
               'id', st.id, 'slug', st.slug, 'lane', st.lane, 'no', st.spot_no, 'name', st.name, 'snippet', st.snippet,
               'artwork', st.artwork_key, 'logo', st.logo_key, 'audio', st.audio_key,
               'excerptTitle', st.excerpt_title, 'excerpt', st.excerpt, 'trailerUrl', st.trailer_url,
               'links', st.links, 'seed', st.seed, 'pal', st.pal, 'endsAt', st.ends_at,
               'stats', private.maker_numbers(st)) as j
        from public.stories st
       where st.starts_at is not null and st.ends_at <= now() and st.ends_at > now() - interval '30 days'
         and st.hidden_at is null and st.removed_at is null
         and ((st.id = any (p_stories[1:20]) and st.visitor = p_visitor)
              or (v_email is not null and lower(st.maker_email) = v_email))
       order by st.ends_at desc
       limit 5
    ) x
  ), '[]'::jsonb);
end $$;

revoke all on function public.maker_ended(text, text, uuid[], uuid) from public, anon, authenticated;
-- a server function: callable, but useless without the server key
grant execute on function public.maker_ended(text, text, uuid[], uuid) to anon;
