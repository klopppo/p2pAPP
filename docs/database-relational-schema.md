# 🗄️ Database Relational Schema - P2P Crypto Platform
# Basato su PostgreSQL 14+ con TypeScript Types

---

## 📋 **CONTENTS**
1. [Table Relationships](#table-relationships)
2. [Complete ER Diagram](#complete-er-diagram)
3. [Detailed Table Definitions](#detailed-table-definitions)
4. [TypeScript Interfaces](#typescript-interfaces)
5. [Indexing Strategy](#indexing-strategy)
6. [Triggers & Functions](#triggers--functions)

---

## 🔄 **TABLE RELATIONSHIPS**

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          USERS RELATIONSHIPS                            │
└─────────────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│  user_private │    │   kyc_applica-│    │reputation_scores│
│   (private)   │    │    tions      │    │               │
└───────────────┘    └───────┬───────┘    └───────┬───────┘
        │                    │                     │
        │ 1:N               │ 1:N                 │
        ▼                    ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│ kyc_documents │    │kyc_providers  │    │reputation_    │
│               │    │               │    │  points       │
└───────────────┘    └───────────────┘    └───────┬───────┘
                                                 │
                                                 │
                                                 ▼
                                          ┌───────────────┐
                                          │reputation_    │
                                          │ recent_stats  │
                                          └───────────────┘
```

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          TRADES RELATIONSHIPS                           │
└─────────────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│   offers      │    │   trades      │    │ trade_events  │
│   (market)    │    │  (transactions)│    │ (audit log)   │
└───────┬───────┘    └───────┬───────┘    └───────┬───────┘
        │                    │                     │
        │                    │                     │
        │ 1:1               │                     │
        ▼                    ▼                     │
┌───────────────┐    ┌───────────────┐            │
│   trades      │    │ trade_ratings │            │
│ (active)      │    │ (reviews)     │            │
└───────────────┘    └───────────────┘            │
        │                                          │
        │ N:1 (FK logica)                          │
        └──────────────────────────────────────────┘
                                 │
                                 ▼
                          ┌───────────────┐
                          │  disputes     │
                          │  (separate)   │
                          └───────────────┘
```

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         REPUTATION RELATIONSHIPS                        │
└─────────────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│reputation_    │    │reputation_    │    │reputation_    │
│ scores        │    │ points        │    │ badges        │
└───────────────┘    └───────┬───────┘    └───────────────┘
        │                    │                     │
        │                    │                     │
        │                    │                     │
        └────────────────────┴─────────────────────┘
                                   │
                                   │
                                   ▼
                            ┌───────────────┐
                            │  users        │
                            │ (FK references)│
                            └───────────────┘
```

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         KYC & SECURITY RELATIONSHIPS                    │
└─────────────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│kyc_applications│   │kyc_documents  │    │reputation_    │
│               │    │               │    │  badges       │
└───────────────┘    └───────────────┘    └───────────────┘
        │ 1:N                  │
        │                      │ 1:N
        ▼                      ▼
┌───────────────┐    ┌───────────────┐
│kyc_providers  │    │kyc_manual_    │
│               │    │  reviews      │
└───────────────┘    └───────────────┘
        │ 1:N
        ▼
┌───────────────┐
│reputation_    │
│  badges       │
└───────────────┘
```

---

## 🎯 **COMPLETE ER DIAGRAM**

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           DATABASE ER DIAGRAM                           │
└─────────────────────────────────────────────────────────────────────────┘


10 btc => 1 euro 

┌───────────────┐         ┌───────────────┐         ┌───────────────┐
│    users      │────────▶│    trades     │◀────────│  offers       │
│───────────────│         │───────────────│         │───────────────│
│ id (PK)       │ 1:N     │ id (PK)       │ 1:1     │ id (PK)       │
│ wallet_address│ ◀────── │ trade_id      │         │ offer_id      │
│ role          │         │ buyer_id      │         │ seller_id     │
│ nickname      │         │ seller_id     │         │ status        │
│ avatar_url    │         │ offer_id      │         │ type          │
│ bio           │         │ crypto_amount │         │ crypto_token  │
│ location      │         │ crypto_price  │         │ fiat_amount   │
│ verification_ │         │ escrow_status │         │ payment_      │
│   level       │         │ created_at    │         │   methods     │
│ reputation_   │         │ completed_at  │         │ published_at  │
│   score       │         │ disputes_at   │         │ expires_at    │
│ total_trades  │         └───────────────┘         │ views         │
│ avg_rating    │                                      │              │
└───────────────┘                                      │              │
        │                                              │              │
        │                                              │              │
        │ 1:1                                        │ 1:1          │
        ▼                                              │              │
┌───────────────┐                                      │              │
│user_private   │                                      │              │
│───────────────│                                      │              │
│ user_id (PK)  │                                      │              │
│ email         │                                      │              │
│ phone_encrypted│                                     │              │
│ wallet_privkey│                                     │              │
│ kyc_id        │                                     │              │
│ twofa_enabled │                                     │              │
│ daily_limit   │                                     │              │
└───────────────┘                                      │              │
        │                                              │              │
        │ 1:N                                        │              │
        ▼                                              │              │
┌───────────────┐                                      │              │
│kyc_applications│                                    │              │
│───────────────│                                    │              │
│ id (PK)       │                                    │              │
│ user_id       │                                    │              │
│ status        │                                    │              │
│ doc_type      │                                    │              │
│ document_     │                                    │              │
│   number      │                                    │              │
│ issuing_country│                                   │              │
│ issue_date    │                                    │              │
│ expiry_date   │                                    │              │
└───────────────┘                                    │              │
        │ 1:N                                        │              │
        ▼                                              │              │
┌───────────────┐                                    │              │
│kyc_documents  │                                    │              │
│───────────────│                                    │              │
│ id (PK)       │                                    │              │
│ kyc_id        │                                    │              │
│ doc_kind      │                                    │              │
│ file_hash     │                                    │              │
│ file_encrypted│                                    │              │
└───────────────┘                                    │              │
        │ 1:N                                        │              │
        ▼                                              │              │
┌───────────────┐      ┌───────────────┐             │              │
│kyc_providers  │──────│kyc_manual_   │             │              │
│───────────────│      │  reviews     │             │              │
│ id (PK)       │      │───────────────│             │              │
│ kyc_id        │      │ id (PK)       │             │              │
│ provider_name │      │ kyc_id        │             │              │
│ status        │      │ reviewer_id   │             │              │
│ verified_at   │      │ decision      │             │              │
└───────────────┘      │ notes         │             │              │
                       │ reviewed_at   │             │              │
                       └───────────────┘             │              │
                                                       │              │
┌───────────────┐       ┌───────────────┐             │              │
│reputation_    │◀──────│trade_ratings  │             │              │
│ scores        │       │───────────────│             │              │
│───────────────│       │ id (PK)       │             │              │
│ user_id (PK)  │       │ trade_id      │             │              │
│ overall       │       │ rater_id      │             │              │
│ trustworthiness│      │ rated_id      │             │              │
│ reliability   │       │ direction     │             │              │
│ communication │       │ score         │             │              │
│ speed         │       │ comment       │             │              │
│ professionalism│      │ anonymous     │             │              │
│ points_total  │       │ submitted_at  │             │              │
│ points_earned │       └───────────────┘             │              │
│ points_lost   │                                     │              │
└───────────────┘                                     │              │
        │ 1:N                                        │              │
        ▼                                              │              │
┌───────────────┐                                      │              │
│reputation_    │                                      │              │
│ points        │                                      │              │
│───────────────│                                      │              │
│ id (PK)       │                                      │              │
│ user_id       │                                      │              │
│ category      │                                      │              │
│ delta         │                                      │              │
│ reason        │                                      │              │
│ source        │                                      │              │
└───────────────┘                                      │              │
        │ 1:N                                        │              │
        ▼                                              │              │
┌───────────────┐                                      │              │
│reputation_    │                                      │              │
│ badges        │                                      │              │
│───────────────│                                      │              │
│ user_id (PK)  │                                      │              │
│ badge         │                                      │              │
│ awarded_at    │                                      │              │
└───────────────┘                                      │              │
        │                                              │              │
        └──────────────────────────────────────────────┘              │
                        │                                              │
                        ▼                                              │
                 ┌───────────────┐                                    │
                 │trade_events   │                                    │
                 │───────────────│                                    │
                 │ id (PK)       │                                    │
                 │ trade_id      │                                    │
                 │ type          │                                    │
                 │ actor         │                                    │
                 │ description   │                                    │
                 │ metadata      │                                    │
                 └───────────────┘                                    │
                        │                                              │
                        │ 1:1                                          │
                        ▼                                              │
                 ┌───────────────┐                                    │
                 │  disputes     │                                    │
                 │───────────────│                                    │
                 │ id (PK)       │                                    │
                 │ dispute_id    │                                    │
                 │ trade_id      │                                    │
                 │ buyer_id      │                                    │
                 │ seller_id     │                                    │
                 │ status        │                                    │
                 │ reason        │                                    │
                 │ created_at    │                                    │
                 └───────────────┘                                    │
                        │                                              │
                        │ 1:N                                          │
                        ▼                                              │
                 ┌───────────────┐                                    │
                 │dispute_evidence│                                   │
                 │───────────────│                                    │
                 │ id (PK)       │                                    │
                 │ dispute_id    │                                    │
                 │ submitted_by  │                                    │
                 │ evidence_kind │                                    │
                 │ file_hash     │                                    │
                 └───────────────┘                                    │
                        │ 1:N                                          │
                        ▼                                              │
                 ┌───────────────┐                                    │
                 │dispute_steps  │                                    │
                 │───────────────│                                    │
                 │ id (PK)       │                                    │
                 │ dispute_id    │                                    │
                 │ step_status   │                                    │
                 │ actor         │                                    │
                 │ description   │                                    │
                 └───────────────┘                                    │
                        │ 1:1                                          │
                        ▼                                              │
                 ┌───────────────┐                                    │
                 │dispute_resol- │                                    │
                 │  utions       │                                    │
                 │───────────────│                                    │
                 │ id (PK)       │                                    │
                 │ dispute_id    │                                    │
                 │ winner        │                                    │
                 │ amount        │                                    │
                 │ reasoning     │                                    │
                 │ escrow_action │                                    │
                 └───────────────┘                                    │
                        │                                              │
                        │ 1:1                                          │
                        ▼                                              │
                 ┌───────────────┐                                    │
                 │dispute_appeals│                                    │
                 │───────────────│                                    │
                 │ id (PK)       │                                    │
                 │ dispute_id    │                                    │
                 │ from_status   │                                    │
                 │ to_status     │                                    │
                 │ appellant_id  │                                    │
                 └───────────────┘                                    │
                        │                                              │
                        │ 1:N                                          │
                        ▼                                              │
                 ┌───────────────┐                                    │
                 │reputation_    │                                    │
                 │ recent_stats  │                                    │
                 │───────────────│                                    │
                 │ user_id (PK)  │                                    │
                 │ window        │                                    │
                 │ trades        │                                    │
                 │ rating        │                                    │
                 │ disputes      │                                    │
                 │ response_hours│                                    │
                 │ computed_at   │                                    │
                 └───────────────┘                                    │
                        │                                              │
                        └──────────────────────────────────────────────┘
```

---

## 📊 **DETAILED TABLE DEFINITIONS**

### **1. USERS**

```sql
CREATE TABLE users (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address      CITEXT NOT NULL UNIQUE,
    role                user_role NOT NULL DEFAULT 'user',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Pubblico
    nickname            VARCHAR(50) UNIQUE,
    avatar_url          TEXT,
    bio                 VARCHAR(500),
    location            VARCHAR(100),
    website             TEXT,
    twitter_handle      VARCHAR(50),
    telegram_handle     VARCHAR(50),
    github_handle       VARCHAR(50),

    -- Metriche cache (denormalizzate)
    verification_level  verification_level NOT NULL DEFAULT 'unverified',
    reputation_score    SMALLINT NOT NULL DEFAULT 50
                        CHECK (reputation_score BETWEEN 0 AND 100),
    total_trades        INT NOT NULL DEFAULT 0,
    completed_trades    INT NOT NULL DEFAULT 0,
    cancelled_trades    INT NOT NULL DEFAULT 0,
    dispute_count       INT NOT NULL DEFAULT 0,
    avg_rating          NUMERIC(3,2) DEFAULT 0
                        CHECK (avg_rating BETWEEN 0 AND 5),
    last_active_at      TIMESTAMPTZ
);
```

### **2. USER PRIVATE**

```sql
CREATE TABLE user_private (
    user_id             UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    email               CITEXT UNIQUE,
    email_verified_at   TIMESTAMPTZ,
    phone_encrypted     BYTEA,
    wallet_privkey_enc  BYTEA,
    kyc_id              UUID,
    twofa_enabled       BOOLEAN NOT NULL DEFAULT false,
    twofa_secret_enc    BYTEA,
    backup_codes_enc    BYTEA,
    daily_limit         NUMERIC(20,8),
    weekly_limit        NUMERIC(20,8),
    daily_used          NUMERIC(20,8) NOT NULL DEFAULT 0,
    weekly_used         NUMERIC(20,8) NOT NULL DEFAULT 0,
    wallet_lock_enabled BOOLEAN NOT NULL DEFAULT false,
    wallet_lock_threshold SMALLINT CHECK (wallet_lock_threshold BETWEEN 0 AND 100),
    wallet_lock_last_unlock TIMESTAMPTZ,
    last_password_change TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### **3. KYC APPLICATIONS**

```sql
CREATE TABLE kyc_applications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    status          kyc_status NOT NULL DEFAULT 'pending',
    doc_type        kyc_doc_type NOT NULL,
    document_number VARCHAR(100) NOT NULL,
    issuing_country CHAR(2) NOT NULL,
    issue_date      DATE,
    expiry_date     DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ
);
```

### **4. KYC DOCUMENTS**

```sql
CREATE TABLE kyc_documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kyc_id          UUID NOT NULL REFERENCES kyc_applications(id) ON DELETE CASCADE,
    doc_kind        VARCHAR(20) NOT NULL CHECK (doc_kind IN ('selfie','front','back')),
    file_hash       BYTEA NOT NULL,
    file_encrypted  BYTEA NOT NULL,
    uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### **5. KYC PROVIDERS**

```sql
CREATE TABLE kyc_providers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kyc_id          UUID NOT NULL REFERENCES kyc_applications(id) ON DELETE CASCADE,
    provider_name   VARCHAR(50) NOT NULL,
    status          kyc_status NOT NULL,
    provider_ref    VARCHAR(200),
    metadata        JSONB NOT NULL DEFAULT '{}',
    verified_at     TIMESTAMPTZ
);
```

### **6. KYC MANUAL REVIEWS**

```sql
CREATE TABLE kyc_manual_reviews (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kyc_id          UUID NOT NULL REFERENCES kyc_applications(id) ON DELETE CASCADE,
    reviewer_id     UUID NOT NULL REFERENCES users(id),
    decision        kyc_status NOT NULL,
    notes           TEXT,
    flags           TEXT[] NOT NULL DEFAULT '{}',
    reviewed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### **7. REPUTATION SCORES**

```sql
CREATE TABLE reputation_scores (
    user_id             UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    overall             SMALLINT NOT NULL DEFAULT 50
                        CHECK (overall BETWEEN 0 AND 100),
    trustworthiness     SMALLINT NOT NULL DEFAULT 50
                        CHECK (trustworthiness BETWEEN 0 AND 100),
    reliability         SMALLINT NOT NULL DEFAULT 50
                        CHECK (reliability BETWEEN 0 AND 100),
    communication      SMALLINT NOT NULL DEFAULT 50
                        CHECK (communication BETWEEN 0 AND 100),
    speed               SMALLINT NOT NULL DEFAULT 50
                        CHECK (speed BETWEEN 0 AND 100),
    professionalism     SMALLINT NOT NULL DEFAULT 50
                        CHECK (professionalism BETWEEN 0 AND 100),
    points_total        INT NOT NULL DEFAULT 0,
    points_earned       INT NOT NULL DEFAULT 0,
    points_lost         INT NOT NULL DEFAULT 0,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### **8. REPUTATION POINTS**

```sql
CREATE TABLE reputation_points (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category        VARCHAR(50) NOT NULL,
    delta           INT NOT NULL,
    reason          VARCHAR(200) NOT NULL,
    source          VARCHAR(20) NOT NULL CHECK (source IN ('trade','rating','dispute','flag','system')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### **9. REPUTATION BADGES**

```sql
CREATE TABLE reputation_badges (
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    badge           VARCHAR(50) NOT NULL,
    awarded_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, badge)
);
```

### **10. REPUTATION RECENT STATS**

```sql
CREATE TABLE reputation_recent_stats (
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    window          VARCHAR(10) NOT NULL CHECK (window IN ('7d','30d')),
    trades          INT NOT NULL DEFAULT 0,
    rating          NUMERIC(3,2) DEFAULT 0,
    disputes        INT NOT NULL DEFAULT 0,
    response_hours  NUMERIC(6,2),
    computed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, window)
);
```

### **11. OFFERS**

```sql
CREATE TABLE offers (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    offer_id            VARCHAR(40) NOT NULL UNIQUE,
    seller_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status              offer_status NOT NULL DEFAULT 'active',
    type                offer_type NOT NULL,

    crypto_token        VARCHAR(10) NOT NULL,
    crypto_amount       NUMERIC(30,18) NOT NULL CHECK (crypto_amount > 0),
    fiat_currency       CHAR(3) NOT NULL,
    fiat_amount         NUMERIC(20,2) NOT NULL CHECK (fiat_amount > 0),
    price_per_unit      NUMERIC(30,18) NOT NULL CHECK (price_per_unit > 0),

    min_amount          NUMERIC(20,2) NOT NULL,
    max_amount          NUMERIC(20,2) NOT NULL,
    payment_methods     TEXT[] NOT NULL,
    available_regions   CHAR(2)[] NOT NULL DEFAULT '{}',

    platform_fee_bps    INT NOT NULL DEFAULT 50 CHECK (platform_fee_bps BETWEEN 0 AND 5000),
    network_fee         NUMERIC(20,8) NOT NULL DEFAULT 0,

    premium_multiplier  NUMERIC(4,2) CHECK (premium_multiplier >= 1),
    tags                TEXT[] NOT NULL DEFAULT '{}',
    featured            BOOLEAN NOT NULL DEFAULT false,

    published_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at          TIMESTAMPTZ,
    views               INT NOT NULL DEFAULT 0,
    clicks              INT NOT NULL DEFAULT 0,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### **12. TRADES**

```sql
CREATE TABLE trades (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trade_id                VARCHAR(40) NOT NULL UNIQUE,
    offer_id                UUID REFERENCES offers(id),
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
```

### **13. TRADE RATINGS**

```sql
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
```

### **14. TRADE EVENTS**

```sql
CREATE TABLE trade_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trade_id        UUID NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
    type            event_type NOT NULL,
    actor           event_actor NOT NULL,
    description     TEXT,
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_events_trade ON trade_events(trade_id, created_at);
```

### **15. DISPUTES**

```sql
CREATE TABLE disputes (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispute_id          VARCHAR(40) NOT NULL UNIQUE,
    trade_id            UUID NOT NULL UNIQUE REFERENCES trades(id) ON DELETE RESTRICT,
    buyer_id            UUID NOT NULL REFERENCES users(id),
    seller_id           UUID NOT NULL REFERENCES users(id),
    status              dispute_status NOT NULL DEFAULT 'open',
    reason              VARCHAR(200) NOT NULL,
    reason_category     dispute_category NOT NULL,
    description         TEXT,
    can_appeal          BOOLEAN NOT NULL DEFAULT true,
    appeal_deadline     TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at         TIMESTAMPTZ
);
```

### **16. DISPUTE EVIDENCE**

```sql
CREATE TABLE dispute_evidence (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispute_id      UUID NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
    submitted_by    VARCHAR(6) NOT NULL CHECK (submitted_by IN ('buyer','seller','neutral')),
    evidence_kind   VARCHAR(30) NOT NULL,
    file_hash       BYTEA NOT NULL,
    file_encrypted  BYTEA NOT NULL,
    submitted_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### **17. DISPUTE STEPS**

```sql
CREATE TABLE dispute_steps (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispute_id          UUID NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
    step_status         VARCHAR(50) NOT NULL,
    actor               VARCHAR(10) NOT NULL CHECK (actor IN ('buyer','seller','platform','mediator')),
    description         TEXT,
    response_deadline   TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### **18. DISPUTE RESOLUTIONS**

```sql
CREATE TABLE dispute_resolutions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispute_id          UUID NOT NULL UNIQUE REFERENCES disputes(id) ON DELETE CASCADE,
    winner              dispute_winner NOT NULL,
    amount              NUMERIC(30,18) NOT NULL,
    reasoning           TEXT NOT NULL,
    decision_by         UUID NOT NULL REFERENCES users(id),
    decision_date       TIMESTAMPTZ NOT NULL DEFAULT now(),
    escrow_action       escrow_action NOT NULL,
    updated_trade_status trade_status NOT NULL
);
```

### **19. DISPUTE APPEALS**

```sql
CREATE TABLE dispute_appeals (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispute_id      UUID NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
    from_status     dispute_status NOT NULL,
    to_status       dispute_status NOT NULL,
    appellant_id    UUID NOT NULL REFERENCES users(id),
    reason          TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### **20. LOGIN SESSIONS**

```sql
CREATE TABLE login_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ip              INET,
    user_agent      TEXT,
    fingerprint    VARCHAR(100),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at      TIMESTAMPTZ
);
```

---

## 💻 **TYPESCRIPT INTERFACES**

```typescript
// ==================== USERS ====================

export interface User {
  id: string
  walletAddress: string
  role: 'user' | 'admin' | 'mediator' | 'support'
  createdAt: Date
  updatedAt: Date

  // Public data
  nickname: string | null
  avatarUrl: string | null
  bio: string | null
  location: string | null
  website: string | null
  twitterHandle: string | null
  telegramHandle: string | null
  githubHandle: string | null

  // Cached metrics
  verificationLevel: 'unverified' | 'verified' | 'trusted' | 'suspicious'
  reputationScore: number
  totalTrades: number
  completedTrades: number
  cancelledTrades: number
  disputeCount: number
  avgRating: number
  lastActiveAt: Date | null
}

export interface UserPrivate {
  userId: string
  email: string | null
  emailVerifiedAt: Date | null
  phoneEncrypted: Buffer | null
  walletPrivkeyEnc: Buffer | null
  kycId: string | null
  twofaEnabled: boolean
  twofaSecretEnc: Buffer | null
  backupCodesEnc: Buffer | null
  dailyLimit: number | null
  weeklyLimit: number | null
  dailyUsed: number
  weeklyUsed: number
  walletLockEnabled: boolean
  walletLockThreshold: number
  walletLockLastUnlock: Date | null
  lastPasswordChange: Date
}

// ==================== KYC ====================

export interface KYCApplication {
  id: string
  userId: string
  status: 'pending' | 'approved' | 'rejected' | 'expired'
  docType: 'passport' | 'id_card' | 'driving_license' | 'national_id'
  documentNumber: string
  issuingCountry: string
  issueDate: Date | null
  expiryDate: Date | null
  createdAt: Date
  updatedAt: Date
  expiresAt: Date | null
}

export interface KYCDocument {
  id: string
  kycId: string
  docKind: 'selfie' | 'front' | 'back'
  fileHash: Buffer
  fileEncrypted: Buffer
  uploadedAt: Date
}

export interface KYCProvider {
  id: string
  kycId: string
  providerName: string
  status: 'pending' | 'approved' | 'rejected' | 'expired'
  providerRef: string | null
  metadata: Record<string, any>
  verifiedAt: Date | null
}

export interface KYCManualReview {
  id: string
  kycId: string
  reviewerId: string
  decision: 'pending' | 'approved' | 'rejected'
  notes: string | null
  flags: string[]
  reviewedAt: Date
}

// ==================== REPUTATION ====================

export interface ReputationScore {
  userId: string
  overall: number
  trustworthiness: number
  reliability: number
  communication: number
  speed: number
  professionalism: number
  pointsTotal: number
  pointsEarned: number
  pointsLost: number
  updatedAt: Date
}

export interface ReputationPoint {
  id: string
  userId: string
  category: string
  delta: number
  reason: string
  source: 'trade' | 'rating' | 'dispute' | 'flag' | 'system'
  createdAt: Date
}

export interface ReputationBadge {
  userId: string
  badge: string
  awardedAt: Date
}

export interface ReputationRecentStats {
  userId: string
  window: '7d' | '30d'
  trades: number
  rating: number
  disputes: number
  responseHours: number | null
  computedAt: Date
}

// ==================== OFFERS ====================

export interface Offer {
  id: string
  offerId: string
  sellerId: string
  status: 'active' | 'paused' | 'completed' | 'cancelled' | 'expired'
  type: 'buy' | 'sell'

  cryptoToken: string
  cryptoAmount: number
  fiatCurrency: string
  fiatAmount: number
  pricePerUnit: number

  minAmount: number
  maxAmount: number
  paymentMethods: string[]
  availableRegions: string[]

  platformFeeBps: number
  networkFee: number

  premiumMultiplier: number | null
  tags: string[]
  featured: boolean

  publishedAt: Date
  expiresAt: Date | null
  views: number
  clicks: number

  createdAt: Date
  updatedAt: Date
}

// ==================== TRADES ====================

export interface Trade {
  id: string
  tradeId: string
  offerId: string | null
  status: 'pending' | 'active' | 'completed' | 'cancelled' | 'disputed' | 'refunded'

  buyerId: string
  sellerId: string

  cryptoToken: string
  cryptoAmount: number
  cryptoPricePerUnit: number
  cryptoTotal: number

  fiatCurrency: string
  fiatAmount: number
  fiatReceived: number

  paymentMethod: string
  paymentDetails: Record<string, any>

  escrowContractAddr: string | null
  escrowStatus: 'locked' | 'held' | 'released' | 'refunded'
  escrowTxHash: string | null
  escrowUnlockType: 'signature' | 'time' | 'both'
  escrowBuyerSignature: string | null
  escrowSellerSignature: string | null
  escrowUnlockAt: Date | null

  avgRating: number | null
  ratingSpeed: number | null
  ratingCommunication: number | null
  ratingReliability: number | null

  hasDispute: boolean

  createdAt: Date
  updatedAt: Date
  completedAt: Date | null
  cancelledAt: Date | null
  disputedAt: Date | null
}

export interface TradeRating {
  id: string
  tradeId: string
  raterId: string
  ratedId: string
  direction: 'buyer' | 'seller'
  score: number
  comment: string | null
  anonymous: boolean
  submittedAt: Date
}

export interface TradeEvent {
  id: string
  tradeId: string
  type: 'offer_created' | 'offer_accepted' | 'payment_sent' | 'crypto_sent' | 'escrow_locked' | 'rating_submitted' | 'dispute_opened' | 'dispute_resolved' | 'refund_issued' | 'cancellation'
  actor: 'buyer' | 'seller' | 'system' | 'mediator'
  description: string | null
  metadata: Record<string, any>
  createdAt: Date
}

// ==================== DISPUTES ====================

export interface Dispute {
  id: string
  disputeId: string
  tradeId: string
  buyerId: string
  sellerId: string
  status: 'open' | 'in_review' | 'resolved' | 'escalated' | 'closed'
  reason: string
  reasonCategory: 'payment_issue' | 'crypto_issue' | 'communication' | 'fraud' | 'other'
  description: string
  canAppeal: boolean
  appealDeadline: Date | null
  createdAt: Date
  updatedAt: Date
  resolvedAt: Date | null
}

export interface DisputeEvidence {
  id: string
  disputeId: string
  submittedBy: 'buyer' | 'seller' | 'neutral'
  evidenceKind: string
  fileHash: Buffer
  fileEncrypted: Buffer
  submittedAt: Date
}

export interface DisputeStep {
  id: string
  disputeId: string
  stepStatus: string
  actor: 'buyer' | 'seller' | 'platform' | 'mediator'
  description: string
  responseDeadline: Date | null
  createdAt: Date
}

export interface DisputeResolution {
  id: string
  disputeId: string
  winner: 'buyer' | 'seller' | 'platform' | 'mutual'
  amount: number
  reasoning: string
  decisionBy: string
  decisionDate: Date
  escrowAction: 'refund_to_buyer' | 'refund_to_seller' | 'hold_funds'
  updatedTradeStatus: string
}

export interface DisputeAppeal {
  id: string
  disputeId: string
  fromStatus: string
  toStatus: string
  appellantId: string
  reason: string
  createdAt: Date
}

// ==================== LOGIN SESSIONS ====================

export interface LoginSession {
  id: string
  userId: string
  ip: string | null
  userAgent: string | null
  fingerprint: string | null
  createdAt: Date
  lastUsedAt: Date
  revokedAt: Date | null
}
```

---

## 🚀 **TRIGGERS & FUNCTIONS**

### **Trigger: Auto-update `updated_at` on all tables**

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all relevant tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_kyc_applications_updated_at BEFORE UPDATE ON kyc_applications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_offers_updated_at BEFORE UPDATE ON offers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_trades_updated_at BEFORE UPDATE ON trades
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### **Trigger: Immutable audit log for trade events**

```sql
CREATE OR REPLACE FUNCTION immutable_audit()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Tabella % è immutabile', TG_TABLE_NAME;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_trade_events_immutable
BEFORE UPDATE OR DELETE ON trade_events
FOR EACH ROW EXECUTE FUNCTION immutable_audit();
```

### **Function: Generate trade ID**

```sql
CREATE OR REPLACE FUNCTION generate_trade_id()
RETURNS VARCHAR AS $$
DECLARE
    v_year VARCHAR(4);
    v_counter VARCHAR(6);
BEGIN
    v_year := to_char(now(), 'YYYY');
    v_counter := lpad(nextval('trade_id_seq')::TEXT, 6, '0');
    RETURN 'TRADE-' || v_year || '-' || v_counter;
END;
$$ LANGUAGE plpgsql;

-- Create sequence
CREATE SEQUENCE trade_id_seq START 1;
```

### **Function: Generate offer ID**

```sql
CREATE OR REPLACE FUNCTION generate_offer_id()
RETURNS VARCHAR AS $$
DECLARE
    v_year VARCHAR(4);
    v_counter VARCHAR(6);
BEGIN
    v_year := to_char(now(), 'YYYY');
    v_counter := lpad(nextval('offer_id_seq')::TEXT, 6, '0');
    RETURN 'OFF-' || v_year || '-' || v_counter;
END;
$$ LANGUAGE plpgsql;

CREATE SEQUENCE offer_id_seq START 1;
```

---

## 📊 **INDEXING STRATEGY**

### **Primary Indexes**

```sql
-- Users
CREATE INDEX idx_users_wallet ON users(wallet_address);
CREATE INDEX idx_users_verification ON users(verification_level);
CREATE INDEX idx_users_reputation ON users(reputation_score DESC);

-- Offers
CREATE INDEX idx_offers_active ON offers(status, expires_at) WHERE status = 'active';
CREATE INDEX idx_offers_seller ON offers(seller_id, status);
CREATE INDEX idx_offers_price ON offers(crypto_token, fiat_currency, price_per_unit);

-- Trades
CREATE INDEX idx_trades_buyer_created ON trades(buyer_id, created_at DESC);
CREATE INDEX idx_trades_seller_created ON trades(seller_id, created_at DESC);
CREATE INDEX idx_trades_status ON trades(status);
CREATE INDEX idx_trades_escrow ON trades(escrow_contract_addr) WHERE escrow_contract_addr IS NOT NULL;

-- Reputation
CREATE INDEX idx_reputation_overall ON reputation_scores(overall DESC);
CREATE INDEX idx_reputation_points_user ON reputation_points(user_id, created_at DESC);

-- KYC
CREATE INDEX idx_kyc_status ON kyc_applications(status);
CREATE INDEX idx_kyc_expiry ON kyc_applications(expires_at) WHERE expires_at IS NOT NULL;

-- Disputes
CREATE INDEX idx_dispute_status ON disputes(status);
```

### **GIN Indexes (for arrays & JSONB)**

```sql
-- Offers
CREATE INDEX idx_offers_payment_gin ON offers USING GIN (payment_methods);
CREATE INDEX idx_offers_regions_gin ON offers USING GIN (available_regions);
CREATE INDEX idx_offers_tags_gin ON offers USING GIN (tags);

-- Trades
CREATE INDEX idx_trades_escrow_addr ON trades(escrow_contract_addr);

-- Users search
CREATE INDEX idx_users_search ON users USING GIN (to_tsvector('simple', coalesce(nickname,'') || ' ' || coalesce(bio,'')));
```

---

## 🎯 **KEY FEATURES**

✅ **Complete relational schema** with 20+ tables
✅ **TypeScript interfaces** for type safety
✅ **PostgreSQL 14+** optimized
✅ **Encrypted sensitive data** (wallet keys, 2FA secrets)
✅ **Immutable audit log** for trade events
✅ **Caching layer** (reputation, metrics)
✅ **Comprehensive indexing** strategy
✅ **Triggers** for auto-updates
✅ **Constraint validation** at DB level

This schema provides a solid foundation for a secure and scalable P2P crypto trading platform! 🚀
