/*
 * A report says whether it was new (Codex review on #9). The same person
 * (ip_hash) reporting the same story again is ignored, as before, but the
 * answer said ok all the same, so /api/reports mailed the team on every
 * repeat. Now `new` is true only when a report row was inserted, and the
 * route mails only then. Same signature and grants; the rest is unchanged.
 */
create or replace function public.report_story(
  p_key text, p_story uuid, p_reason text, p_note text, p_email text, p_visitor text, p_ip_hash text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_story public.stories;
  v_open  integer;
  v_new   integer;
begin
  perform private.assert_server(p_key);
  select * into v_story from public.stories where id = p_story and starts_at is not null and removed_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'hidden', false, 'new', false);
  end if;
  if (select count(*) from public.reports where ip_hash = p_ip_hash and created_at > now() - interval '1 day') >= 20 then
    return jsonb_build_object('ok', false, 'hidden', v_story.hidden_at is not null, 'new', false);
  end if;
  insert into public.reports (story_id, reason, note, email, visitor, ip_hash)
  values (p_story, p_reason, nullif(left(p_note, 500), ''), nullif(left(p_email, 200), ''), p_visitor, p_ip_hash)
  on conflict (story_id, ip_hash) do nothing;
  get diagnostics v_new = row_count;
  select count(*) into v_open from public.reports
   where story_id = p_story and resolved_at is null
     and created_at > coalesce(v_story.reviewed_at, '-infinity');
  if v_story.hidden_at is null and (v_open >= 3 or p_reason = 'child') then
    update public.stories set hidden_at = now(), hidden_reason = 'reported' where id = p_story;
    return jsonb_build_object('ok', true, 'hidden', true, 'new', v_new > 0);
  end if;
  return jsonb_build_object('ok', true, 'hidden', v_story.hidden_at is not null, 'new', v_new > 0);
end $$;
