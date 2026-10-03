-- free_place, serialized per address (Codex review on #14): two placements
-- from one address at the same moment could both see fewer than three live
-- free spots and both go live. A transaction lock per address makes the
-- count and the placement one step; other addresses never wait.

create or replace function public.free_place(p_key text, p_story jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ip   text := nullif(p_story ->> 'ipHash', '');
  v      jsonb;
begin
  perform private.assert_server(p_key);
  if v_ip is not null then
    perform pg_advisory_xact_lock(hashtextextended('free_place:' || v_ip, 0));
    if (
      select count(*) from public.stories
       where ip_hash = v_ip and starts_at is not null and ends_at > now()
         and removed_at is null and coalesce(amount_total, 0) = 0
    ) >= 3 then
      raise exception 'too_many_live' using errcode = 'P0001';
    end if;
  end if;
  v := public.checkout_reserve(p_key, p_story);
  perform public.checkout_complete(p_key, (v ->> 'id')::uuid, null, 0, 'usd');
  return v;
end $$;
