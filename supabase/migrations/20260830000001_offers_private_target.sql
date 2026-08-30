-- Private offers: optional target-only visibility + notify the target.
--
-- Model: an offer may be marked private (`is_private`) and pinned to one
-- wallet address (`target_user`). RLS then restricts READ to the seller and
-- the target; everyone else — including anon marketplace readers — cannot see
-- the row at all. An AFTER INSERT trigger notifies the target when the offer
-- lands, and opens it in the marketplace list once they connect.
--
-- Idempotent: column/constraint/trigger adds are guarded, policies are
-- dropped by name and recreated on every run (same style as
-- 20260829000002_siwe_auth_rls.sql).

-- =====================================================================
-- 1. COLUMNS + CONSISTENCY GUARANTEES
-- =====================================================================

alter table public.offers
  add column if not exists is_private boolean not null default false;

alter table public.offers
  add column if not exists target_user varchar(42);

-- is_private and target_user must agree: a private offer always names a
-- target, and naming a target implies a private offer.
alter table public.offers drop constraint if exists offers_private_consistency_check;
alter table public.offers add constraint offers_private_consistency_check check (
  (is_private = false and target_user is null)
  or (is_private = true  and target_user is not null)
);

-- target_user is a 20-byte Ethereum address.
alter table public.offers drop constraint if exists offers_target_user_address_check;
alter table public.offers add constraint offers_target_user_address_check check (
  target_user is null or target_user ~ '^0x[a-fA-F0-9]{40}$'
);

-- Fast lookup of incoming private offers for a wallet.
create index if not exists idx_offers_private_target
  on public.offers (target_user)
  where is_private;

-- =====================================================================
-- 2. RLS — private rows are readable ONLY by seller + target.
-- =====================================================================

drop policy if exists "offers_select_public" on public.offers;

create policy "offers_select_public"
  on public.offers for select
  to anon, authenticated
  using (is_private = false);

create policy "offers_select_private_parties"
  on public.offers for select
  to authenticated
  using (
    is_private = true
    and (
      seller_id = public.current_user_id()
      or lower(target_user) = lower(coalesce(auth.jwt() ->> 'wallet_address', ''))
    )
  );

-- =====================================================================
-- 3. NOTIFY THE TARGET when a private offer is created.
-- =====================================================================

create or replace function public.notify_private_offer_target()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_id uuid;
begin
  if not new.is_private or new.target_user is null then
    return new;
  end if;

  select id into v_target_id
    from public.users
   where wallet_address = lower(new.target_user)
   limit 1;

  -- No users row yet for the target wallet (or the seller targeted
  -- themselves) → silent skip. The offer still surfaces in the marketplace
  -- list the moment the target connects and signs in.
  if v_target_id is null or v_target_id = new.seller_id then
    return new;
  end if;

  insert into public.notifications (user_id, kind, title, body, payload)
  values (
    v_target_id,
    'trade_update',
    'You received a private offer',
    format('%s %s · max %s %s', upper(new.type), new.crypto_token, new.max_amount, new.fiat_currency),
    jsonb_build_object(
      'offer_id', new.id,
      'url', '/app/offer/' || new.id
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_offers_notify_private_target on public.offers;
create trigger trg_offers_notify_private_target
  after insert on public.offers
  for each row
  execute function public.notify_private_offer_target();