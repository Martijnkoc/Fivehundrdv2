/*
 * Control Room: payments apart from placements (2026-10-03). With free spots
 * (NEXT_PUBLIC_PAYMENTS unset) a story goes live for $0, and fd_kpis' "paid"
 * counted it as a payment. "paid" stays what it always measured, stories that
 * went live in the period; "payments" counts only those with money in them,
 * for Payments, Average order and "spots purchased". The headline function
 * keeps its name and arguments; the original becomes private.fd_kpis_base.
 */

alter function public.fd_kpis(text, timestamptz, timestamptz, jsonb) rename to fd_kpis_base;
alter function public.fd_kpis_base(text, timestamptz, timestamptz, jsonb) set schema private;
revoke all on function private.fd_kpis_base(text, timestamptz, timestamptz, jsonb) from public, anon, authenticated;

create function public.fd_kpis(p_key text, p_from timestamptz, p_to timestamptz, p_f jsonb default '{}')
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare vf boolean := private.fd_has_vf(p_f);
begin
  return private.fd_kpis_base(p_key, p_from, p_to, p_f) || jsonb_build_object('payments', (
    select count(*) from public.stories st
     where st.starts_at >= p_from and st.starts_at < p_to and coalesce(st.amount_total, 0) > 0
       and private.fd_story_ok(p_f, st)
       and (not vf or st.visitor in (select x from private.fd_visitors(p_f, p_from, p_to) x))
  ));
end $$;

revoke all on function public.fd_kpis(text, timestamptz, timestamptz, jsonb) from public, anon, authenticated;
-- a server function: callable, but useless without the server key
grant execute on function public.fd_kpis(text, timestamptz, timestamptz, jsonb) to anon;

/* Transactions are payments too: a free spot is no transaction (Codex review on #16) */
create or replace function public.fd_transactions(p_key text, p_from timestamptz, p_to timestamptz, p_f jsonb default '{}')
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_server(p_key);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', st.id, 'paidAt', st.starts_at, 'lane', st.lane, 'no', st.spot_no, 'name', st.name,
      'creator', coalesce(st.maker_email, 'visitor ' || left(st.visitor, 8)),
      'currency', coalesce(st.currency, 'usd'), 'amount', coalesce(st.amount_total, 0),
      'fee', st.stripe_fee, 'refund', coalesce(st.refund_amount, 0), 'refundedAt', st.refunded_at,
      'dispute', coalesce(st.dispute_amount, 0), 'disputeStatus', st.dispute_status,
      'net', coalesce(st.amount_total, 0) - coalesce(st.refund_amount, 0) - coalesce(st.stripe_fee, 0) - coalesce(st.dispute_amount, 0),
      'paymentIntent', st.payment_intent, 'session', st.stripe_session_id) order by st.starts_at desc)
    from public.stories st
   where st.starts_at >= p_from and st.starts_at < p_to and coalesce(st.amount_total, 0) > 0
     and private.fd_story_ok(p_f, st)
  ), '[]'::jsonb);
end $$;
