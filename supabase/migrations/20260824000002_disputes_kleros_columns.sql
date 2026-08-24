-- Extend `disputes` with the indexer-shaped columns the on-chain
-- KlerosEsc events emit. Idempotent.
--
-- See docs/dispute-status.md §P0 gaps (evidence_group_id, appeal_count,
-- raiser, fee_paid_wei, winner, dispute_timestamp, ruling_received_time).

alter table public.disputes
  add column if not exists evidence_group_id     integer not null default 0;
alter table public.disputes
  add column if not exists appeal_count          integer not null default 0;
alter table public.disputes
  add column if not exists raiser                text
    check (raiser is null or raiser in ('buyer','seller'));
alter table public.disputes
  add column if not exists fee_paid_wei          text;
alter table public.disputes
  add column if not exists winner                text
    check (winner is null or winner in ('buyer','seller'));
alter table public.disputes
  add column if not exists dispute_timestamp     bigint;
alter table public.disputes
  add column if not exists ruling_received_time  bigint;

-- =====================================================================
-- HOT INDEXES
-- =====================================================================
--
-- disputes.kleros_dispute_id is the primary lookup key for the (planned)
-- server-side indexer. Already queried in the dispute list UI today.
create unique index if not exists idx_disputes_kleros_dispute_id
  on public.disputes(kleros_dispute_id)
  where kleros_dispute_id is not null;

-- disputes.escrow_address powers the cross-link from a Kleros Court event
-- back to the matching Supabase row.
create index if not exists idx_disputes_escrow_address
  on public.disputes(escrow_address)
  where escrow_address is not null;

-- disputes.on_chain_ruling is filterable on the detail page and used in
-- stats queries.
create index if not exists idx_disputes_on_chain_ruling
  on public.disputes(on_chain_ruling)
  where on_chain_ruling is not null;

create index if not exists idx_disputes_evidence_group_id
  on public.disputes(evidence_group_id);
