-- Allow the client to create/update its own row in `users` when a wallet
-- connects (see src/hooks/useSyncUser.ts -> upsertUser in src/lib/supabase).
--
-- Context: the table already exists and has a permissive SELECT policy (anon
-- can read), but it had NO insert/update policy, so every connect-time upsert
-- failed with "new row violates row-level security policy" (42501) and nothing
-- was ever saved.
--
-- ⚠️ SECURITY: these policies are intentionally permissive so wallet-connect
-- syncing works before wallet-based auth exists. Until that lands, any anon
-- client can insert/update ANY wallet_address. Before production, lock this
-- down by tying writes to a Supabase session obtained via Sign-In with
-- Ethereum (SIWE), e.g.:
--     with check (coalesce(auth.jwt() ->> 'wallet_address', '') = wallet_address)
-- after minting a JWT that carries the verified wallet address.

-- INSERT: allow client to create its row on first connect.
drop policy if exists "users_insert_any" on public.users;
create policy "users_insert_any"
  on public.users for insert
  to anon, authenticated
  with check (true);

-- UPDATE: allow client to refresh last_active_at / profile on reconnect.
drop policy if exists "users_update_any" on public.users;
create policy "users_update_any"
  on public.users for update
  to anon, authenticated
  using (true)
  with check (true);
