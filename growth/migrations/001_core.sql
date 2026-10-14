-- Growth database core schema.
--
-- This is the GROWTH database (Railway Postgres), not the multi-tenant product
-- database. Prospect/sales data is ours; product data is our customers'.
-- Applied by `npm run migrate` (src/migrate.ts), which records each file in
-- schema_migrations. Graphile Worker manages its own graphile_worker schema.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- One row per prospect/customer company. `domain` is the work-email domain
-- (NULL for freemail addresses, which can't identify a company).
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    domain TEXT UNIQUE,
    stage TEXT NOT NULL DEFAULT 'lead'
        CHECK (stage IN ('lead', 'qualified', 'demo', 'trial', 'customer', 'churned', 'disqualified')),
    fit_score INT CHECK (fit_score BETWEEN 0 AND 100),
    enrichment JSONB,
    enriched_at TIMESTAMPTZ,
    attio_record_id TEXT,
    attio_synced_at TIMESTAMPTZ,
    attio_sync_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per human. Email is the identity key (stored lowercased).
CREATE TABLE people (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    role TEXT,
    phone TEXT,
    attio_record_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_people_organization ON people(organization_id);

-- Every "Book a Demo" submission, including repeats from the same person.
CREATE TABLE demo_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'requested'
        CHECK (status IN ('requested', 'scheduled', 'completed', 'no_show', 'canceled')),
    -- What they told us
    company_name TEXT NOT NULL,
    state TEXT,
    operation_type TEXT,
    facility_size TEXT,
    current_tools TEXT,
    message TEXT,
    -- Where they came from
    source TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    referrer TEXT,
    -- Salted SHA-256 of the client IP, used only for abuse rate limiting
    ip_hash TEXT,
    user_agent TEXT,
    scheduled_at TIMESTAMPTZ,
    notified_at TIMESTAMPTZ,
    attio_entry_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_demo_requests_person ON demo_requests(person_id);
CREATE INDEX idx_demo_requests_status ON demo_requests(status, created_at DESC);
CREATE INDEX idx_demo_requests_ip_recent ON demo_requests(ip_hash, created_at DESC);

-- Conversations with a prospect: form submissions, emails, call and demo notes.
-- Call recorders (e.g. Granola) write `call_note` messages here later.
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    person_id UUID REFERENCES people(id) ON DELETE SET NULL,
    subject TEXT,
    channel TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'call', 'form', 'other')),
    external_source TEXT,
    external_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (external_source, external_id)
);
CREATE INDEX idx_conversations_org ON conversations(organization_id, updated_at DESC);

CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('form', 'email', 'call_note', 'demo_note')),
    direction TEXT CHECK (direction IN ('inbound', 'outbound', 'internal')),
    author TEXT,
    body TEXT NOT NULL,
    metadata JSONB,
    attio_note_id TEXT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_messages_conversation ON messages(conversation_id, occurred_at);

-- Append-only timeline of everything that happens to a prospect.
CREATE TABLE activities (
    id BIGSERIAL PRIMARY KEY,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    person_id UUID REFERENCES people(id) ON DELETE SET NULL,
    type TEXT NOT NULL,
    data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_activities_org ON activities(organization_id, created_at DESC);
CREATE INDEX idx_activities_person ON activities(person_id, created_at DESC);

-- State cannabis licenses matched to organizations by enrichment.
CREATE TABLE licenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    state TEXT NOT NULL,
    license_number TEXT NOT NULL,
    license_type TEXT,
    status TEXT,
    legal_name TEXT,
    dba TEXT,
    city TEXT,
    expires_on DATE,
    source TEXT NOT NULL,
    raw JSONB,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (state, license_number)
);
CREATE INDEX idx_licenses_org ON licenses(organization_id);

-- One row per enrichment attempt, for auditing cost and failures.
CREATE TABLE enrichment_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed', 'skipped')),
    output JSONB,
    error TEXT,
    input_tokens INT,
    output_tokens INT,
    attio_note_id TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ
);
CREATE INDEX idx_enrichment_runs_org ON enrichment_runs(organization_id, started_at DESC);
