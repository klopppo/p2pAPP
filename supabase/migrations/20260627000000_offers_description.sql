-- Add a free-form description to offers.
--
-- Sellers can attach extra context to their offer (preferred meeting window,
-- KYC requirements, accepted banks, etc.) shown to takers on the offer page.
-- Nullable so existing offers keep working; no default.

alter table public.offers
  add column if not exists description text;