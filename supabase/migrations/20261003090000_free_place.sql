-- Free spots while the wall fills up (founder's ask, 2026-10-03).
--
-- With NEXT_PUBLIC_PAYMENTS unset, /api/checkout calls free_place instead of
-- sending the maker to Stripe: the same hold as checkout_reserve (its limits
-- included), then live at once with an amount of 0, so revenue stays real.
-- One address holds at most three free spots on the wall at a time; without
-- that, one person could fill a lane. Stripe's functions are unchanged.

create or replace function public.free_place(p_key text, p_story jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ip   text := nullif(p_story ->> 'ipHash', '');
  v      jsonb;
begin
  perform private.assert_server(p_key);
  if v_ip is not null and (
    select count(*) from public.stories
     where ip_hash = v_ip and starts_at is not null and ends_at > now()
       and removed_at is null and coalesce(amount_total, 0) = 0
  ) >= 3 then
    raise exception 'too_many_live' using errcode = 'P0001';
  end if;
  v := public.checkout_reserve(p_key, p_story);
  perform public.checkout_complete(p_key, (v ->> 'id')::uuid, null, 0, 'usd');
  return v;
end $$;

revoke all on function public.free_place(text, jsonb) from public, anon, authenticated;
-- server function: callable, but useless without the server key
grant execute on function public.free_place(text, jsonb) to anon;
