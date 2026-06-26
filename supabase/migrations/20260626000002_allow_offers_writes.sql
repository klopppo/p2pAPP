-- Allow the client to create/update offers, and make any offer-maintenance
-- triggers bypass RLS (same pattern as users / users triggers).
--
-- Without this, createOffer() fails with:
--     42501 — new row violates row-level security policy for table "offers"
--
-- ⚠️ SECURITY: permissive until wallet-based auth (SIWE) is wired up — any anon
-- client can currently insert/update any offer. Lock down before production
-- (e.g. with check (seller resolves to the verified wallet in auth.jwt())).

drop policy if exists "offers_insert_any" on public.offers;
create policy "offers_insert_any"
  on public.offers for insert
  to anon, authenticated
  with check (true);

drop policy if exists "offers_update_any" on public.offers;
create policy "offers_update_any"
  on public.offers for update
  to anon, authenticated
  using (true)
  with check (true);

-- Run offer-maintenance triggers (e.g. companion-table writes) as SECURITY
-- DEFINER so they aren't blocked by those tables' RLS.
do $$
declare
  fn regprocedure;
begin
  for fn in
    select distinct p.oid::regprocedure
    from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
    join pg_class c on c.oid = t.tgrelid
    where c.relname = 'offers'
      and not t.tgisinternal
  loop
    execute format('alter function %s security definer', fn);
  end loop;
end $$;
