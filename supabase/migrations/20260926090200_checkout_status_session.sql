-- The server needs the Stripe session to expire it when a maker cancels.
create or replace function public.checkout_status(p_key text, p_story uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_server(p_key);
  return (
    select jsonb_build_object('status', coalesce(sp.status, 'released'), 'lane', st.lane, 'no', st.spot_no,
                              'name', st.name, 'startsAt', st.starts_at, 'endsAt', st.ends_at,
                              'session', st.stripe_session_id)
      from public.stories st left join public.spots sp on sp.story_id = st.id
     where st.id = p_story
  );
end $$;
