-- =================================================================
-- P2P CRYPTO EXCHANGE - RBAC, AUDIT LOGGER & OPERATOR DASHBOARD
-- Migration: 002-rbac-audit-logger-operator-dashboard.sql
-- Target: PostgreSQL 14+ / Supabase
-- =================================================================

-- =================================================================
-- 1. ENUMS
-- =================================================================

DROP TYPE IF EXISTS operator_status CASCADE;
CREATE TYPE operator_status AS ENUM ('ACTIVE', 'SUSPENDED', 'REVOKED');

DROP TYPE IF EXISTS report_status CASCADE;
CREATE TYPE report_status AS ENUM ('PENDING', 'IN_REVIEW', 'RESOLVED', 'DISMISSED');

DROP TYPE IF EXISTS report_category CASCADE;
CREATE TYPE report_category AS ENUM (
    'SCAM_ATTEMPT',
    'ABUSIVE_MESSAGES',
    'PAYMENT_FRAUD',
    'IMPERSONATION',
    'OFF_PLATFORM_TRADING',
    'TERMS_VIOLATION',
    'OTHER'
);

-- =================================================================
-- 2. PROGRAMMI DI SISTEMA (MODULES)
-- =================================================================

CREATE TABLE IF NOT EXISTS sys_programs (
    id              VARCHAR(64) PRIMARY KEY,
    name            VARCHAR(128) NOT NULL,
    description     TEXT,
    category        VARCHAR(64) NOT NULL DEFAULT 'GENERAL',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =================================================================
-- 3. RUOLI DI SISTEMA
-- =================================================================

CREATE TABLE IF NOT EXISTS sys_roles (
    id              VARCHAR(64) PRIMARY KEY,
    name            VARCHAR(128) NOT NULL,
    description     TEXT,
    is_system       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =================================================================
-- 4. PERMESSI ATOMICI
-- =================================================================

CREATE TABLE IF NOT EXISTS sys_permissions (
    id              VARCHAR(64) PRIMARY KEY,
    name            VARCHAR(128) NOT NULL,
    description     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =================================================================
-- 5. MATRICE: PROGRAMMA <-> RUOLO <-> PERMESSO
-- =================================================================

CREATE TABLE IF NOT EXISTS sys_program_role_permissions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id      VARCHAR(64) NOT NULL REFERENCES sys_programs(id) ON DELETE CASCADE,
    role_id         VARCHAR(64) NOT NULL REFERENCES sys_roles(id) ON DELETE CASCADE,
    permission_id   VARCHAR(64) NOT NULL REFERENCES sys_permissions(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (program_id, role_id, permission_id)
);

-- =================================================================
-- 6. OPERATORI (STAFF / BACKOFFICE)
-- =================================================================

CREATE TABLE IF NOT EXISTS sys_operators (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    wallet_address  VARCHAR(42) UNIQUE,
    username        VARCHAR(64) UNIQUE NOT NULL,
    email           VARCHAR(255) UNIQUE NOT NULL,
    full_name       VARCHAR(128),
    status          operator_status NOT NULL DEFAULT 'ACTIVE',
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =================================================================
-- 7. ASSEGNAZIONE RUOLI OPERATORE (M:N)
-- =================================================================

CREATE TABLE IF NOT EXISTS sys_operator_roles (
    operator_id     UUID NOT NULL REFERENCES sys_operators(id) ON DELETE CASCADE,
    role_id         VARCHAR(64) NOT NULL REFERENCES sys_roles(id) ON DELETE CASCADE,
    assigned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    assigned_by     UUID REFERENCES sys_operators(id) ON DELETE SET NULL,
    PRIMARY KEY (operator_id, role_id)
);

-- =================================================================
-- 8. AUDIT LOGGER DEI MOVIMENTI UTENTE & OPERATORE
-- =================================================================

CREATE TABLE IF NOT EXISTS user_activity_logs (
    id              BIGSERIAL PRIMARY KEY,
    -- Soggetto che esegue l'azione
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    operator_id     UUID REFERENCES sys_operators(id) ON DELETE SET NULL,
    wallet_address  VARCHAR(42),

    -- Contesto Operativo
    program_id      VARCHAR(64) REFERENCES sys_programs(id) ON DELETE SET NULL,
    action          VARCHAR(64) NOT NULL,
    resource_type   VARCHAR(64),
    resource_id     VARCHAR(128),

    -- Dati & Snapshot
    old_state       JSONB,
    new_state       JSONB,
    metadata        JSONB DEFAULT '{}'::jsonb,

    -- Telemetria & Sessione
    status          VARCHAR(32) NOT NULL DEFAULT 'SUCCESS',
    error_message   TEXT,
    ip_address      INET,
    user_agent      TEXT,
    session_id      VARCHAR(128),

    -- Timestamp immutabile
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON user_activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_operator_id ON user_activity_logs(operator_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_wallet ON user_activity_logs(wallet_address);
CREATE INDEX IF NOT EXISTS idx_activity_logs_program ON user_activity_logs(program_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON user_activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_activity_logs_resource ON user_activity_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON user_activity_logs(created_at DESC);

-- =================================================================
-- 9. TABELLA SEGNALAZIONI UTENTI (USER REPORTS)
-- =================================================================

CREATE TABLE IF NOT EXISTS user_reports (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_user_id        UUID REFERENCES users(id) ON DELETE SET NULL,
    reporter_wallet         VARCHAR(42) NOT NULL,
    reported_user_id        UUID REFERENCES users(id) ON DELETE SET NULL,
    reported_wallet         VARCHAR(42) NOT NULL,
    
    -- Dettagli Segnalazione
    category                report_category NOT NULL DEFAULT 'OTHER',
    reason                  TEXT NOT NULL,
    evidence_urls           TEXT[] DEFAULT '{}',
    
    -- Collegamenti opzionali a contesti di trading / chat / dispute
    trade_id                UUID REFERENCES trades(id) ON DELETE SET NULL,
    dispute_id              UUID REFERENCES disputes(id) ON DELETE SET NULL,
    conversation_id         UUID REFERENCES chat_conversations(id) ON DELETE SET NULL,
    message_id              UUID,

    -- Stato e Risoluzione Operatore
    status                  report_status NOT NULL DEFAULT 'PENDING',
    resolution_notes        TEXT,
    resolved_by_operator_id UUID REFERENCES sys_operators(id) ON DELETE SET NULL,
    resolved_at             TIMESTAMPTZ,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_reports_status ON user_reports(status);
CREATE INDEX IF NOT EXISTS idx_user_reports_reporter ON user_reports(reporter_wallet);
CREATE INDEX IF NOT EXISTS idx_user_reports_reported ON user_reports(reported_wallet);
CREATE INDEX IF NOT EXISTS idx_user_reports_created ON user_reports(created_at DESC);

-- =================================================================
-- 10. SEED DATA: PROGRAMMI, RUOLI, PERMESSI & MATRICE
-- =================================================================

-- Programmi di sistema
INSERT INTO sys_programs (id, name, description, category) VALUES
    ('OPERATOR_PORTAL', 'Operator Portal Core', 'Pannello di controllo e overview operatori', 'SYSTEM'),
    ('AUDIT_LOGGER', 'Audit & Movements Logger', 'Consultazione log completi e telemetria azioni utente', 'AUDIT'),
    ('USER_REPORTS', 'User Reports / Segnalazioni', 'Gestione e risoluzione segnalazioni inviate dagli utenti', 'COMPLIANCE'),
    ('MESSAGES_INSPECTOR', 'User Messages Inspector', 'Ispezione e verifica chat e messaggistica utenti per segnalazioni', 'SUPPORT'),
    ('TRADES_MONITOR', 'Trades & Escrow Monitor', 'Controllo transazioni e stati contratti escrow', 'TRADING'),
    ('DISPUTES_CONSOLE', 'Disputes Console', 'Gestione controversie, evidenze e arbitraggio', 'DISPUTES'),
    ('RBAC_MANAGEMENT', 'RBAC & Operators Admin', 'Gestione ruoli, permessi e anagrafica operatori', 'SECURITY')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    category = EXCLUDED.category;

-- Ruoli di sistema
INSERT INTO sys_roles (id, name, description, is_system) VALUES
    ('SUPER_ADMIN', 'Super Administrator', 'Accesso completo a tutti i moduli, configurazione RBAC e audit', TRUE),
    ('COMPLIANCE_LEAD', 'Compliance Lead', 'Supervisione segnalazioni, audit utente e sanzioni', TRUE),
    ('SUPPORT_OPERATOR', 'Support Operator', 'Assistenza utenti, revisione chat segnalate e trades', TRUE),
    ('ARBITRATOR', 'Arbitrator / Dispute Resolver', 'Gestione e risoluzione controversie escrow', TRUE),
    ('AUDITOR_READONLY', 'Auditor (Read-Only)', 'Accesso in sola lettura ai log di audit e telemetria', TRUE)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description;

-- Permessi atomici
INSERT INTO sys_permissions (id, name, description) VALUES
    ('VIEW', 'Visualizzazione', 'Permesso di visualizzare dati e sezioni del programma'),
    ('CREATE', 'Creazione', 'Permesso di inserire nuovi record o risorse'),
    ('EDIT', 'Modifica', 'Permesso di modificare dati esistenti'),
    ('DELETE', 'Eliminazione', 'Permesso di eliminare risorse o disattivare voci'),
    ('EXECUTE', 'Esecuzione Azioni', 'Permesso di eseguire azioni di sistema o workflow'),
    ('VIEW_PRIVATE_MESSAGES', 'Lettura Messaggi Utenti', 'Permesso di accedere alle chat private per indagini/segnalazioni'),
    ('RESOLVE_REPORT', 'Risoluzione Segnalazioni', 'Permesso di chiudere o archiviare segnalazioni utenti'),
    ('MANAGE_OPERATORS', 'Gestione Operatori', 'Permesso di creare/modificare operatori e ruoli'),
    ('AUDIT_READ', 'Lettura Audit Log', 'Permesso di consultare i log dei movimenti utente')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description;

-- Matrice Programma - Ruolo - Permesso
-- SUPER_ADMIN ha tutti i permessi su tutti i programmi
INSERT INTO sys_program_role_permissions (program_id, role_id, permission_id)
SELECT p.id, 'SUPER_ADMIN', perm.id
FROM sys_programs p
CROSS JOIN sys_permissions perm
ON CONFLICT DO NOTHING;

-- COMPLIANCE_LEAD: View su tutto, Audit, Reports, Messages Inspector
INSERT INTO sys_program_role_permissions (program_id, role_id, permission_id) VALUES
    ('OPERATOR_PORTAL', 'COMPLIANCE_LEAD', 'VIEW'),
    ('AUDIT_LOGGER', 'COMPLIANCE_LEAD', 'VIEW'),
    ('AUDIT_LOGGER', 'COMPLIANCE_LEAD', 'AUDIT_READ'),
    ('USER_REPORTS', 'COMPLIANCE_LEAD', 'VIEW'),
    ('USER_REPORTS', 'COMPLIANCE_LEAD', 'EDIT'),
    ('USER_REPORTS', 'COMPLIANCE_LEAD', 'RESOLVE_REPORT'),
    ('MESSAGES_INSPECTOR', 'COMPLIANCE_LEAD', 'VIEW'),
    ('MESSAGES_INSPECTOR', 'COMPLIANCE_LEAD', 'VIEW_PRIVATE_MESSAGES'),
    ('TRADES_MONITOR', 'COMPLIANCE_LEAD', 'VIEW'),
    ('DISPUTES_CONSOLE', 'COMPLIANCE_LEAD', 'VIEW')
ON CONFLICT DO NOTHING;

-- SUPPORT_OPERATOR: View portal, Reports (View + Resolve), Messages Inspector (View + View Private), Trades Monitor
INSERT INTO sys_program_role_permissions (program_id, role_id, permission_id) VALUES
    ('OPERATOR_PORTAL', 'SUPPORT_OPERATOR', 'VIEW'),
    ('USER_REPORTS', 'SUPPORT_OPERATOR', 'VIEW'),
    ('USER_REPORTS', 'SUPPORT_OPERATOR', 'RESOLVE_REPORT'),
    ('MESSAGES_INSPECTOR', 'SUPPORT_OPERATOR', 'VIEW'),
    ('MESSAGES_INSPECTOR', 'SUPPORT_OPERATOR', 'VIEW_PRIVATE_MESSAGES'),
    ('TRADES_MONITOR', 'SUPPORT_OPERATOR', 'VIEW'),
    ('DISPUTES_CONSOLE', 'SUPPORT_OPERATOR', 'VIEW')
ON CONFLICT DO NOTHING;

-- ARBITRATOR: View portal, Disputes, Trades, Messages
INSERT INTO sys_program_role_permissions (program_id, role_id, permission_id) VALUES
    ('OPERATOR_PORTAL', 'ARBITRATOR', 'VIEW'),
    ('DISPUTES_CONSOLE', 'ARBITRATOR', 'VIEW'),
    ('DISPUTES_CONSOLE', 'ARBITRATOR', 'EXECUTE'),
    ('MESSAGES_INSPECTOR', 'ARBITRATOR', 'VIEW'),
    ('MESSAGES_INSPECTOR', 'ARBITRATOR', 'VIEW_PRIVATE_MESSAGES'),
    ('TRADES_MONITOR', 'ARBITRATOR', 'VIEW')
ON CONFLICT DO NOTHING;

-- AUDITOR_READONLY: View portal, Audit logger
INSERT INTO sys_program_role_permissions (program_id, role_id, permission_id) VALUES
    ('OPERATOR_PORTAL', 'AUDITOR_READONLY', 'VIEW'),
    ('AUDIT_LOGGER', 'AUDITOR_READONLY', 'VIEW'),
    ('AUDIT_LOGGER', 'AUDITOR_READONLY', 'AUDIT_READ'),
    ('USER_REPORTS', 'AUDITOR_READONLY', 'VIEW'),
    ('TRADES_MONITOR', 'AUDITOR_READONLY', 'VIEW')
ON CONFLICT DO NOTHING;

-- =================================================================
-- 11. DEMO OPERATORS (SEED)
-- =================================================================

INSERT INTO sys_operators (id, username, email, full_name, status, wallet_address) VALUES
    ('10000000-0000-0000-0000-000000000001', 'admin_sarah', 'sarah.admin@coffernode.io', 'Sarah Jenkins (SuperAdmin)', 'ACTIVE', '0x1111111111111111111111111111111111111111'),
    ('10000000-0000-0000-0000-000000000002', 'compliance_marco', 'marco.c@coffernode.io', 'Marco Rossi (Compliance Lead)', 'ACTIVE', '0x2222222222222222222222222222222222222222'),
    ('10000000-0000-0000-0000-000000000003', 'support_elena', 'elena.support@coffernode.io', 'Elena Bianchi (Support Specialist)', 'ACTIVE', '0x3333333333333333333333333333333333333333')
ON CONFLICT (username) DO NOTHING;

INSERT INTO sys_operator_roles (operator_id, role_id) VALUES
    ('10000000-0000-0000-0000-000000000001', 'SUPER_ADMIN'),
    ('10000000-0000-0000-0000-000000000002', 'COMPLIANCE_LEAD'),
    ('10000000-0000-0000-0000-000000000003', 'SUPPORT_OPERATOR')
ON CONFLICT DO NOTHING;
