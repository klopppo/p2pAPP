-- Add cached ruling column to disputes so the detail page can render the
-- last-known on-chain ruling without re-reading the escrow (e.g. when the user
-- lands on the page before wagmi has hydrated).
--
-- Populated by updateDisputeOnChain() in src/lib/supabase after
-- executeRuling() / appeal() / rule() events land.

alter table public.disputes
  add column if not exists on_chain_ruling smallint;