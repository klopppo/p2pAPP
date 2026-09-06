-- Dispute evidence storage bucket.
--
-- Dispute evidence (screenshots, payment proofs, chat captures) is uploaded
-- to Supabase Storage instead of IPFS because the browser Helia node never
-- pinned CIDs to the public network (audit #4). The objects in this bucket
-- hold sensitive PII — payment screenshots, bank handles, etc. — so the
-- bucket is PRIVATE (no public URL), and Storage RLS gates reads on
-- party-membership of the underlying dispute.
--
-- Object paths follow `${dispute_id}/${random-or-filename}` so an attacker
-- who guesses one UUID can't list another dispute's files (defence in depth:
-- even if the RLS predicate is wrong, the path namespace is isolated).
--
-- Storage RLS notes:
--   • `dispute-evidence` bucket is PRIVATE (public=false) — only signed URLs
--     resolve. The storage policies below further restrict which rows in
--     `storage.objects` the storage API exposes to a given session.
--   • RLS predicates join `storage.objects.name` → `dispute_id` → `disputes`
--     and require `disputes.buyer_id = public.current_user_id()` or
--     `disputes.seller_id = public.current_user_id()` (the JWT-derived
--     `wallet_address` claim, see 20260829000002_siwe_auth_rls.sql).
--   • Insert: caller must be a party to the dispute the object belongs to.
--     The path convention enforces this at the prefix level (only parties
--     can insert under `${dispute_id}/`).
--   • Update / Delete: scoped to party; lets a party overwrite their own
--     evidence before submission without exposing others' files.

-- 1. Create the bucket (idempotent). PRIVATE — no `public=true`.
insert into storage.buckets (id, name, public)
values ('dispute-evidence', 'dispute-evidence', false)
on conflict (id) do update set public = excluded.public;

-- Helper: extract the leading UUID segment from an object name. Object
-- names look like `<dispute_id>/<random>.<ext>` or `<dispute_id>/<n>.<ext>`.
-- Returns null for malformed names so the RLS predicates fail closed.
create or replace function public.storage_object_dispute_id(obj_name text)
returns uuid
language sql
immutable
as $$
  -- Take the first path segment if it parses as a UUID; null otherwise.
  select case
    when obj_name is null then null
    when strpos(obj_name, '/') = 0 then null
    else nullif(
      split_part(obj_name, '/', 1)::uuid,
      '00000000-0000-0000-0000-000000000000'::uuid
    )
  end;
$$;

-- 2. Party-only reads. The object name's first path segment must be a
-- dispute UUID the caller is a buyer or seller of.
drop policy if exists "dispute_evidence_read_parties" on storage.objects;
create policy "dispute_evidence_read_parties"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'dispute-evidence'
    and exists (
      select 1 from public.disputes d
      where d.id = public.storage_object_dispute_id(name)
        and (d.buyer_id = public.current_user_id()
             or d.seller_id = public.current_user_id())
    )
  );

-- 3. Party-only inserts. The dispute_id embedded in the path must belong
-- to the caller. Reject anon (no JWT → no `current_user_id()`).
drop policy if exists "dispute_evidence_insert_parties" on storage.objects;
create policy "dispute_evidence_insert_parties"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'dispute-evidence'
    and exists (
      select 1 from public.disputes d
      where d.id = public.storage_object_dispute_id(name)
        and (d.buyer_id = public.current_user_id()
             or d.seller_id = public.current_user_id())
    )
  );

-- 4. Party-only updates (overwrite own evidence before submit, etc.).
drop policy if exists "dispute_evidence_update_parties" on storage.objects;
create policy "dispute_evidence_update_parties"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'dispute-evidence'
    and exists (
      select 1 from public.disputes d
      where d.id = public.storage_object_dispute_id(name)
        and (d.buyer_id = public.current_user_id()
             or d.seller_id = public.current_user_id())
    )
  )
  with check (
    bucket_id = 'dispute-evidence'
    and exists (
      select 1 from public.disputes d
      where d.id = public.storage_object_dispute_id(name)
        and (d.buyer_id = public.current_user_id()
             or d.seller_id = public.current_user_id())
    )
  );

-- 5. Party-only deletes.
drop policy if exists "dispute_evidence_delete_parties" on storage.objects;
create policy "dispute_evidence_delete_parties"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'dispute-evidence'
    and exists (
      select 1 from public.disputes d
      where d.id = public.storage_object_dispute_id(name)
        and (d.buyer_id = public.current_user_id()
             or d.seller_id = public.current_user_id())
    )
  );
