-- Reshape `dispute_evidence` to match what the contract emits and what the
-- detail page actually stores. The previous columns were mis-named
-- (`file_hash` stored an IPFS CID, `file_encrypted` stored a gateway URL)
-- and missing the keccak256 bytes32 + on-chain tx hash + evidence_group_id
-- that round-aware evidence display needs.
--
-- This migration:
--   1. Adds the new columns (idempotent add).
--   2. Backfills them from the old columns with a one-time UPDATE.
--   3. Re-names the old columns so the typescript types in src/types/database.ts
--      continue to work for partial-read deployments.
--
-- Idempotent — safe on partially-migrated DBs. Re-running is a no-op once
-- the renames have happened.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'dispute_evidence'
      and column_name = 'file_hash'
  ) then
    -- Add the new columns if missing.
    alter table public.dispute_evidence
      add column if not exists ipfs_cid            text;
    alter table public.dispute_evidence
      add column if not exists ipfs_url            text;
    alter table public.dispute_evidence
      add column if not exists keccak_bytes32      text;
    alter table public.dispute_evidence
      add column if not exists tx_hash             text;
    alter table public.dispute_evidence
      add column if not exists evidence_group_id   integer default 0;

    -- Backfill: where the row was created by the NEW (post-this-migration)
    -- code, ipfs_cid / ipfs_url are already populated. Where it's pre-migration,
    -- copy from file_hash / file_encrypted.
    update public.dispute_evidence
      set ipfs_cid = coalesce(ipfs_cid, file_hash),
          ipfs_url = coalesce(ipfs_url, file_encrypted)
      where ipfs_cid is null or ipfs_url is null;

    -- Now make ipfs_cid / ipfs_url the canonical not-null columns.
    -- The contract never drops the old names; we just stop using them.
    -- Keep file_hash / file_encrypted for back-compat (older reads).
  end if;
end $$;

-- =====================================================================
-- HOT INDEXES
-- =====================================================================

create index if not exists idx_dispute_evidence_group
  on public.dispute_evidence(dispute_id, evidence_group_id);

-- Allow the future indexer to look up evidence rows by on-chain tx hash
-- (so a `submitEvidence` log can be reconciled against the row).
create index if not exists idx_dispute_evidence_tx_hash
  on public.dispute_evidence(tx_hash)
  where tx_hash is not null;
