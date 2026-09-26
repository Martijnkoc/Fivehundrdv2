-- §12 Keep my card: once a visitor logs in, the saves made in this browser
-- (kept per visitor id) belong to their account, and the account's saves from
-- other devices come back. Returns my_saves().
create function public.sync_card(p_visitor text, p_remind boolean default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  update public.saves set user_id = v_user
   where visitor = p_visitor and user_id is null;
  insert into public.profiles (user_id, remind) values (v_user, coalesce(p_remind, true))
  on conflict (user_id) do update set remind = coalesce(p_remind, public.profiles.remind);
  return public.my_saves();
end $$;

revoke all on function public.sync_card(text, boolean) from public, anon;
grant execute on function public.sync_card(text, boolean) to authenticated;
