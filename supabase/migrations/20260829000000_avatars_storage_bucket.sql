-- Avatars storage bucket.
--
-- Avatar images are uploaded to Supabase Storage (not IPFS) because the
-- browser Helia node cannot make CIDs retrievable from the public gateway,
-- so uploaded avatars never rendered on /profile. A Storage object URL is
-- always retrievable.
--
-- Storage RLS notes: the app authenticates by wallet address, not by Supabase
-- auth session (see 20260626000000_allow_users_writes.sql). So, like the `users`
-- table, this bucket intentionally allows permissive anon uploads. Public
-- objects are world-readable (needed so any visitor's profile can render its
-- avatar). Before production, tighten this with wallet-signed JWT / SIWE.

-- 1. Create the bucket (idempotent).
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = excluded.public;

-- 2. Public read for everyone (needed to display avatars on any profile).
drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'avatars');

-- 3. Allow uploads/overwrites (permissive until wallet-auth lands).
drop policy if exists "avatars_anon_write" on storage.objects;
create policy "avatars_anon_write"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'avatars');

drop policy if exists "avatars_anon_update" on storage.objects;
create policy "avatars_anon_update"
  on storage.objects for update
  to anon, authenticated
  using (bucket_id = 'avatars')
  with check (bucket_id = 'avatars');
