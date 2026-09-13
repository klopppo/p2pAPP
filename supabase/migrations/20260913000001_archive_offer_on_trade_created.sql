-- Archive an offer the moment a trade is opened against it.
--
-- Product rule: a marketplace offer is one-shot. The instant a taker
-- accepts it (a `trades` row with `offer_id` is created) the offer is
-- consumed — it must leave the public marketplace (`getActiveOffers` only
-- returns `status='active'`) and live on only in the seller's own offers
-- table (ProfilePage, `getOffersBySeller` shows every status).
--
-- Implemented as an AFTER INSERT trigger rather than a client call so the
-- flip is atomic with trade creation, works for every write path (TradePage,
-- future indexers), and can't be skipped by a racy double-accept.
--
-- SECURITY DEFINER: `trades` insert is already gated by `trades_insert_parties`
-- (caller must be buyer or seller), so only authorized users can reach this
-- trigger, and it only ever flips the EXACT offer the new trade references —
-- no privilege escalation. `set search_path` pinned per repo convention.

create or replace function public.archive_offer_on_trade_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.offer_id is not null then
    update public.offers
      set status = 'completed'::offer_status,
          updated_at = now()
      where id = NEW.offer_id
        and status = 'active'::offer_status;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_archive_offer_on_trade_created on public.trades;
create trigger trg_archive_offer_on_trade_created
  after insert on public.trades
  for each row
  execute function public.archive_offer_on_trade_created();