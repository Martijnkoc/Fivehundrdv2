/*
 * Letting go of a Scout on another device (review fix). A save made on
 * device A reaches device B through the account, but device B has no saves
 * row of its own, so unsaving there matched nothing and returned before the
 * call was hidden. Signed in (p_user), the account's saves are matched too,
 * and the call is hidden whether or not this browser had a row.
 */
create or replace function public.record_event(p_key text, p_story uuid, p_kind text, p_visitor text, p_ip_hash text, p_user uuid default null)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_id bigint; v_n int;
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
    insert into public.saves (visitor, story_id, user_id) values (p_visitor, p_story, p_user) on conflict do nothing;
    if not found then return false; end if;
    update public.stories set saves = saves + 1 where id = p_story;
    perform private.scout_record(p_user, p_visitor, p_story);
  elsif p_kind = 'unsave' then
    update public.scout_calls set hidden_at = now()
     where story_id = p_story and hidden_at is null and (visitor = p_visitor or (p_user is not null and user_id = p_user));
    with d as (
      delete from public.saves
       where story_id = p_story and (visitor = p_visitor or (p_user is not null and user_id = p_user))
      returning 1)
    select count(*) into v_n from d;
    if v_n = 0 then return false; end if;
    update public.stories set saves = greatest(0, saves - v_n) where id = p_story;
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
