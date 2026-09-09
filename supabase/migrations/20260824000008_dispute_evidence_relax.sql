-- Finalize the `dispute_evidence` reshape from migration
-- 20260824000003_dispute_evidence_columns.sql.
--
-- That migration added the canonical `ipfs_cid` / `ipfs_url` columns and
-- backfilled them from the legacy `file_hash` / `file_encrypted` columns, but
-- stopped short of making the new columns NOT NULL. Result: pre-migration
-- inserts (and any row whose `file_hash` happened to be NULL for any reason)
-- would now land in a state where `ipfs_cid` / `ipfs_url` are NULL and the
-- app crashes on read (see src/pages/DisputeDetailPage.tsx where the gallery
-- assumes both fields exist).
--
-- This migration:
--   1. Re-runs the backfill UPDATE so any pre-existing NULLs are mirrored
--      from the legacy columns (defensive — 20260824000003 already does this
--      but partial deployments might have missed a row).
--   2. Sets NOT NULL on `ipfs_cid` and `ipfs_url` (the canonical columns).
--   3. Drops NOT NULL on the legacy `file_hash` and `file_encrypted` columns
--      so they can be safely retired without breaking old INSERTs.
--
-- Idempotent — safe to re-run on a fully-migrated DB (each step is a no-op
-- once the constraint is in place).

-- ---------------------------------------------------------------------------
-- 1) Backfill: copy any remaining NULL ipfs_cid / ipfs_url from the legacy
--    columns. Mirrors the safety step in 20260824000003.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'dispute_evidence'
      and column_name = 'file_encrypted'
  ) then
    update public.dispute_evidence
      set ipfs_cid = coalesce(ipfs_cid, file_hash::text),
          ipfs_url = coalesce(ipfs_url, file_encrypted::text)
      where ipfs_cid is null or ipfs_url is null;
  else
    update public.dispute_evidence
      set ipfs_cid = coalesce(ipfs_cid, file_hash::text)
      where ipfs_cid is null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2) Enforce NOT NULL on the canonical columns. Wrap in DO blocks so the
--    migration is idempotent on a DB that already has the constraint.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'dispute_evidence'
      and column_name = 'ipfs_cid' and is_nullable = 'YES'
  ) then
    alter table public.dispute_evidence
      alter column ipfs_cid set not null;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'dispute_evidence'
      and column_name = 'ipfs_url' and is_nullable = 'YES'
  ) then
    alter table public.dispute_evidence
      alter column ipfs_url set not null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3) Drop NOT NULL on the legacy columns so older code paths / partial INSERTs
--    don't fail after the rename. The columns are still kept on the table so
--    older Supabase clients can read them (see docs/dispute-status.md).
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'dispute_evidence'
      and column_name = 'file_hash' and is_nullable = 'NO'
  ) then
    alter table public.dispute_evidence
      alter column file_hash drop not null;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'dispute_evidence'
      and column_name = 'file_encrypted' and is_nullable = 'NO'
  ) then
    alter table public.dispute_evidence
      alter column file_encrypted drop not null;
  end if;
end $$;
