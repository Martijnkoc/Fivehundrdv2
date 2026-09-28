-- Fivehundrd. The Wall v2: Supabase platform pieces.

-- Every minute: release abandoned checkouts and free spots whose 72 hours are over.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('fivehundrd-wall-tick', '* * * * *', 'select private.wall_tick()');

-- Media (§8, §13): public read; visitors upload drafts under pending/ before
-- paying. Artwork and logos are shrunk client-side to JPEG first.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('art', 'art', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('audio', 'audio', true, 4000000, array['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/webm'])
on conflict (id) do nothing;

create policy "visitors upload draft media" on storage.objects for insert to anon, authenticated
  with check (bucket_id in ('art', 'audio') and (storage.foldername(name))[1] = 'pending');

-- The server key is created once, outside version control:
--   select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'fivehundrd_server_key');
-- and the same value set as FIVEHUNDRD_SERVER_KEY on the Vercel project.
