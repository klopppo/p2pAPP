-- =================================================================
-- P2P CRYPTO EXCHANGE - ESCROW LIFECYCLE UPDATE
-- Migration: Sync database schema with smart contract states
-- Target: PostgreSQL 14+
-- =================================================================

-- =================================================================
-- 1. UPDATE ENUMS
-- =================================================================

-- Update escrow_status enum to match smart contract
DROP TYPE IF EXISTS escrow_status CASCADE;
CREATE TYPE escrow_status AS ENUM (
    'awaiting_deposit',   -- Contract deployed, waiting for deposit
    'deposited',          -- Funds locked, awaiting confirmation
    'pending_release',    -- Buyer confirmed, grace period running
    'disputed',           -- Frozen, awaiting arbitrator
    'released',           -- Seller paid, trade completed
    'refunded'            -- Buyer refunded
);

-- Update unlock_type enum (clean up unused values)
DROP TYPE IF EXISTS unlock_type CASCADE;
CREATE TYPE unlock_type AS ENUM ('time', 'both');

-- =================================================================
-- 2. DROP & RECREATE TRADES TABLE
-- =================================================================

DROP TABLE IF EXISTS trades CASCADE;

CREATE TABLE trades (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trade_id                VARCHAR(40) NOT NULL UNIQUE,
    offer_id                UUID REFERENCES offers(id) ON DELETE SET NULL,

    -- Trading details
    crypto_token            VARCHAR(10) NOT NULL,
    crypto_amount           NUMERIC(30,18) NOT NULL CHECK (crypto_amount > 0),
    crypto_price_per_unit   NUMERIC(30,18) NOT NULL CHECK (crypto_price_per_unit > 0),
    crypto_total            NUMERIC(30,18) GENERATED ALWAYS AS
                            (crypto_amount * crypto_price_per_unit) STORED,

    fiat_currency           CHAR(3) NOT NULL,
    fiat_amount             NUMERIC(20,2) NOT NULL CHECK (fiat_amount > 0),
    fiat_received           NUMERIC(20,2) NOT NULL DEFAULT 0,

    payment_method          VARCHAR(50) NOT NULL,
    payment_details         JSONB NOT NULL DEFAULT '{}',

    -- Escrow contract details
    escrow_contract_addr    VARCHAR(42) NOT NULL,          -- 0x...
    escrow_tx_hash          VARCHAR(66),
    escrow_status           escrow_status NOT NULL DEFAULT 'awaiting_deposit',

    -- Unlock configuration (time-based)
    escrow_timeout          TIMESTAMPTZ NOT NULL,
    escrow_release_after    TIMESTAMPTZ NOT NULL,          -- Confirmation + grace period

    -- Platform fee tracking
    platform_fee_bps        INT NOT NULL CHECK (platform_fee_bps BETWEEN 0 AND 10000),
    treasury_address        VARCHAR(42),                    -- Address where fees are collected

    -- Dispute tracking
    has_dispute             BOOLEAN NOT NULL DEFAULT false,

    -- Rating aggregated
    avg_rating              NUMERIC(3,2) CHECK (avg_rating IS NULL OR avg_rating BETWEEN 1 AND 5),
    rating_speed            NUMERIC(3,2),
    rating_communication    NUMERIC(3,2),
    rating_reliability      NUMERIC(3,2),

    -- Timestamps
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at            TIMESTAMPTZ,
    cancelled_at            TIMESTAMPTZ,
    disputed_at             TIMESTAMPTZ
);

-- Indexes for trades table
CREATE INDEX idx_trades_buyer_created ON trades(buyer_id, created_at DESC);
CREATE INDEX idx_trades_seller_created ON trades(seller_id, created_at DESC);
CREATE INDEX idx_trades_status ON trades(status);
CREATE INDEX idx_trades_escrow_contract ON trades(escrow_contract_addr);
CREATE INDEX idx_trades_escrow_status ON trades(escrow_status);
CREATE INDEX idx_trades_escrow_timeout ON trades(escrow_timeout);

-- =================================================================
-- 3. UPDATE TRADE EVENTS ENUM
-- =================================================================

DROP TYPE IF EXISTS event_type CASCADE;
CREATE TYPE event_type AS ENUM (
    -- Offer lifecycle
    'offer_created',
    'offer_accepted',
    'offer_completed',
    'offer_cancelled',
    'offer_expired',

    -- Trade lifecycle
    'payment_sent',
    'crypto_sent',
    'escrow_deposited',        -- Buyer deposited funds
    'escrow_confirmed',        -- Buyer confirmed (grace period started)
    'escrow_released',         -- Funds released to seller
    'escrow_refunded',         -- Buyer refunded
    'escrow_disputed',         -- Dispute opened
    'escrow_resolved',         -- Dispute resolved by arbitrator
    'rating_submitted',
    'dispute_opened',
    'dispute_resolved',
    'cancellation',
    'refund_issued'
);

CREATE INDEX idx_events_trade ON trade_events(trade_id, created_at);

-- =================================================================
-- 4. UPDATE TRADE RATINGS TABLE
-- =================================================================

-- Drop old table if exists and recreate
DROP TABLE IF EXISTS trade_ratings CASCADE;

CREATE TABLE trade_ratings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trade_id        UUID NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
    rater_id        UUID NOT NULL REFERENCES users(id),
    rated_id        UUID NOT NULL REFERENCES users(id),
    direction       VARCHAR(6) NOT NULL CHECK (direction IN ('buyer','seller')),
    score           SMALLINT NOT NULL CHECK (score BETWEEN 1 AND 5),
    comment         VARCHAR(1000),
    anonymous       BOOLEAN NOT NULL DEFAULT false,
    submitted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (trade_id, direction)
);

-- =================================================================
-- 5. RENAME & CLEANUP TRADE EVENTS TABLE
-- =================================================================

-- Trade events already exists, we just need to ensure it uses the new event_type
-- No DDL needed, just ensure the constraint is enforced

-- =================================================================
-- 6. OPTIMIZE INDEXES
-- =================================================================

-- Trades - new composite index for buyer dashboard
CREATE INDEX idx_trades_buyer_status_created ON trades(buyer_id, status, created_at DESC);

-- Trades - composite index for seller dashboard
CREATE INDEX idx_trades_seller_status_created ON trades(seller_id, status, created_at DESC);

-- Disputes - index on trade_id and status
CREATE INDEX idx_dispute_trade_status ON disputes(trade_id, status);

-- =================================================================
-- 7. ADD TRIGGERS FOR AUTO-UPDATES
-- =================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all relevant tables
CREATE TRIGGER update_trades_updated_at BEFORE UPDATE ON trades
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_trades_completed_at BEFORE UPDATE OF completed_at ON trades
    FOR EACH ROW
    WHEN (NEW.completed_at IS NOT NULL AND
          OLD.completed_at IS NULL)
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_trades_disputed_at BEFORE UPDATE OF disputed_at ON trades
    FOR EACH ROW
    WHEN (NEW.disputed_at IS NOT NULL AND
          OLD.disputed_at IS NULL)
    EXECUTE FUNCTION update_updated_at_column();

-- =================================================================
-- 8. REVERSE MIGRATION SCRIPT (for rollback)
-- =================================================================

-- This section documents how to rollback changes if needed
-- Run this in reverse order of the changes above

/*
-- Rollback 8: Remove triggers
DROP TRIGGER IF EXISTS update_trades_updated_at ON trades;
DROP TRIGGER IF EXISTS update_trades_completed_at ON trades;
DROP TRIGGER IF EXISTS update_trades_disputed_at ON trades;
DROP FUNCTION IF EXISTS update_updated_at_column();

-- Rollback 7: Drop indexes
DROP INDEX IF EXISTS idx_trades_buyer_status_created;
DROP INDEX IF EXISTS idx_trades_seller_status_created;
DROP INDEX IF EXISTS idx_dispute_trade_status;

-- Rollback 6: Drop dispute index
DROP INDEX IF EXISTS idx_dispute_trade_status;

-- Rollback 5: Nothing to rollback for trade_events (constraint auto-updates)

-- Rollback 4: Drop trade_ratings
DROP TABLE IF EXISTS trade_ratings CASCADE;

-- Rollback 3: Nothing to rollback for trade_events

-- Rollback 2: Drop and recreate trades table with old schema
DROP TABLE IF EXISTS trades CASCADE;

CREATE TABLE trades (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trade_id                VARCHAR(40) NOT NULL UNIQUE,
    offer_id                UUID REFERENCES offers(id) ON DELETE SET NULL,
    status                  trade_status NOT NULL DEFAULT 'pending',
    buyer_id                UUID NOT NULL REFERENCES users(id),
    seller_id               UUID NOT NULL REFERENCES users(id),
    CHECK (buyer_id <> seller_id),
    crypto_token            VARCHAR(10) NOT NULL,
    crypto_amount           NUMERIC(30,18) NOT NULL CHECK (crypto_amount > 0),
    crypto_price_per_unit   NUMERIC(30,18) NOT NULL CHECK (crypto_price_per_unit > 0),
    crypto_total            NUMERIC(30,18) GENERATED ALWAYS AS
                            (crypto_amount * crypto_price_per_unit) STORED,
    fiat_currency           CHAR(3) NOT NULL,
    fiat_amount             NUMERIC(20,2) NOT NULL CHECK (fiat_amount > 0),
    fiat_received           NUMERIC(20,2) NOT NULL DEFAULT 0,
    payment_method          VARCHAR(50) NOT NULL,
    payment_details         JSONB NOT NULL DEFAULT '{}',
    escrow_contract_addr    VARCHAR(42),
    escrow_status           escrow_status NOT NULL DEFAULT 'locked',
    escrow_tx_hash          VARCHAR(66),
    escrow_unlock_type      unlock_type NOT NULL DEFAULT 'both',
    escrow_buyer_signature  TEXT,
    escrow_seller_signature TEXT,
    escrow_unlock_at        TIMESTAMPTZ,
    avg_rating              NUMERIC(3,2) CHECK (avg_rating IS NULL OR avg_rating BETWEEN 1 AND 5),
    rating_speed            NUMERIC(3,2),
    rating_communication    NUMERIC(3,2),
    rating_reliability      NUMERIC(3,2),
    has_dispute             BOOLEAN NOT NULL DEFAULT false,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at            TIMESTAMPTZ,
    cancelled_at            TIMESTAMPTZ,
    disputed_at             TIMESTAMPTZ
);

CREATE INDEX idx_trades_buyer_created ON trades(buyer_id, created_at DESC);
CREATE INDEX idx_trades_seller_created ON trades(seller_id, created_at DESC);
CREATE INDEX idx_trades_status ON trades(status);
CREATE INDEX idx_trades_escrow ON trades(escrow_contract_addr) WHERE escrow_contract_addr IS NOT NULL;

-- Rollback 3: Restore old event_type enum
DROP TYPE IF EXISTS event_type CASCADE;
CREATE TYPE event_type AS ENUM (
    'offer_created','offer_accepted','payment_sent','crypto_sent',
    'escrow_locked','rating_submitted','dispute_opened','dispute_resolved',
    'refund_issued','cancellation'
);

-- Rollback 2: Drop old escrow_status enum
DROP TYPE IF EXISTS escrow_status CASCADE;
CREATE TYPE escrow_status AS ENUM ('locked','held','released','refunded');

-- Rollback 1: Drop new enum and recreate old one
DROP TYPE IF EXISTS unlock_type CASCADE;
*/
