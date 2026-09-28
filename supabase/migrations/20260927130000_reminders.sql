/*
 * Reminders: "One of your Finds leaves The Wall in an hour", by email, to
 * people who kept their card (signed in) and left reminders on. Anonymous
 * visitors have no address, so they get none.
 *
 * Every 10 minutes pg_cron asks the site to send what's due (the site holds
 * the email provider's key): stories a person saved that end 5 to 70 minutes
 * from now, each reminded once. Nothing is sent until the site's address is
 * in Vault ('fivehundrd_site_url') and the site has an email provider.
 */

create table public.reminders (
  user_id  uuid not null references auth.users (id) on delete cascade,
  story_id uuid not null references public.stories (id) on delete cascade,
  sent_at  timestamptz not null default now(),
  primary key (user_id, story_id)
);
alter table public.reminders enable row level security;
revoke all on public.reminders from public, anon, authenticated;

/** Who should hear about what: one row per person, their saved stories that end within the hour. */
create function public.reminders_due(p_key text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_server(p_key);
  return coalesce((
    select jsonb_agg(jsonb_build_object('user', x.user_id, 'email', x.email, 'stories', x.stories))
      from (
        select u.id as user_id, u.email,
               jsonb_agg(jsonb_build_object('id', st.id, 'name', st.name, 'lane', st.lane, 'no', st.spot_no, 'slug', st.slug,
                                            'endsAt', st.ends_at) order by st.ends_at) as stories
          from public.saves s
          join public.profiles p on p.user_id = s.user_id and p.remind
          join auth.users u on u.id = s.user_id and u.email is not null
          join public.stories st on st.id = s.story_id
          join public.spots sp on sp.story_id = st.id and sp.status = 'live'
         where st.ends_at > now() + interval '5 minutes' and st.ends_at <= now() + interval '70 minutes'
           and st.hidden_at is null and st.removed_at is null
           and not exists (select 1 from public.reminders r where r.user_id = s.user_id and r.story_id = st.id)
         group by u.id, u.email
      ) x
  ), '[]'::jsonb);
end $$;

/** Marks reminders as sent (once each). */
create function public.reminders_sent(p_key text, p_user uuid, p_stories uuid[]) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  perform private.assert_server(p_key);
  insert into public.reminders (user_id, story_id) select p_user, unnest(p_stories) on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

/** The "turn off reminders" link in every email. */
create function public.remind_off(p_key text, p_user uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_server(p_key);
  update public.profiles set remind = false where user_id = p_user;
  return found;
end $$;

/** Asks the site to send what's due (pg_cron, every 10 minutes); quiet until the site's address is in Vault. */
create function private.ping_reminders() returns void
language plpgsql security definer set search_path = '' as $$
declare
  site text := (select decrypted_secret from vault.decrypted_secrets where name = 'fivehundrd_site_url');
  key text := (select decrypted_secret from vault.decrypted_secrets where name = 'fivehundrd_server_key');
begin
  if site is null or key is null or not exists (select 1 from pg_extension where extname = 'pg_net') then return; end if;
  perform net.http_post(
    url := rtrim(site, '/') || '/api/cron/reminders',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Authorization', 'Bearer ' || key, 'Content-Type', 'application/json')
  );
end $$;

revoke all on function private.ping_reminders() from public, anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array['reminders_due(text)', 'reminders_sent(text, uuid, uuid[])', 'remind_off(text, uuid)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to anon', f);
  end loop;
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('fivehundrd-reminders', '*/10 * * * *', 'select private.ping_reminders()');
  end if;
end $$;
