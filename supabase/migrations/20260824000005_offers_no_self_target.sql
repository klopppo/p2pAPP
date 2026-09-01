-- Tighten private-offer validation: a seller cannot target themselves.
--
-- The CHECK constraint added in 20260830000001 only enforces (is_private ⇔
-- target_user NOT NULL) — it allows `target_user = seller.wallet_address`,
-- which produces a "private" offer visible to no one other than the seller
-- (functionally equivalent to a public offer, just a duplicate visibility
-- class). Add a deferred constraint trigger that rejects self-targeting.
--
-- Deferred because the check needs to look up the seller's wallet from
-- `users.wallet_address`, which is a separate table.
-- Idempotent.

drop trigger if exists trg_offers_no_self_target on public.offers;

create or replace function public.reject_self_targeted_offer()
returns trigger
language plpgsql
as $$
declare
  v_seller_wallet text;
begin
  if not new.is_private or new.target_user is null then
    return new;
  end if;

  select u.wallet_address
    into v_seller_wallet
    from public.users u
   where u.id = new.seller_id;

  if v_seller_wallet is not null
     and lower(v_seller_wallet) = lower(new.target_user) then
    raise exception 'offers.target_user cannot equal the seller''s wallet (0x%)',
      v_seller_wallet
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create constraint trigger trg_offers_no_self_target
  after insert or update on public.offers
  deferrable initially deferred
  for each row execute function public.reject_self_targeted_offer();

-- Also: a CHECK that target_user is a syntactically validates EVM address
-- regardless of is_private. The original migration already has this, but
-- the check is duplicated here as a belt-and-braces for deployments that
-- somehow skipped 20260830000001.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'offers_target_user_address_check'
  ) then
    alter table public.offers
      add constraint offers_target_user_address_check
      check (target_user is null or target_user ~ '^0x[a-fA-F0-9]{40}$');
  end if;
end $$;
