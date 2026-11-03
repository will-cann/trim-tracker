-- ============================================================================
-- Migration 070: Self-serve Metrc connections (T3 key per company)
-- ============================================================================
-- Until now a Metrc connection meant a dedicated Netlify site per customer
-- with T3_API_KEY / T3_MODE / MANIFEST_COMPANY_IDS in its environment. This
-- table lets a director connect their own Track & Trace Tools secret key from
-- Settings → Metrc on the shared site. The key is stored encrypted with the
-- server's METRC_CONNECTION_KEY (AES-256-GCM; see utils/metrcConnections.ts)
-- and only ever decrypted server-side for a T3 call.
--
-- One connection per company. The env-var deploy keeps working unchanged: the
-- runner reads this table first and falls back to the env when the company is
-- the one allowlisted on the site.
--
-- Run: node scripts/run-migration.mjs migrations/070_metrc_connections.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS metrc_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,

    -- "v1:<iv>:<tag>:<ciphertext>" (base64url parts); never the plain key.
    api_key_encrypted TEXT NOT NULL,
    -- Last four characters, so Settings can show which key is loaded.
    api_key_hint VARCHAR(8) NOT NULL,

    -- What this company lets NeuroCann do with the key (same meaning as T3_MODE).
    mode VARCHAR(16) NOT NULL DEFAULT 'read-only' CHECK (mode IN ('read-only', 'sandbox', 'live')),
    -- paused: keep the key, skip scheduled syncs (manual runs still allowed).
    status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),

    -- What T3 said about the Metrc login behind the key at the last verify.
    metrc_username TEXT,
    metrc_hostname TEXT,
    has_t3plus BOOLEAN,
    t3plus_tier TEXT,
    api_access_level TEXT,
    -- [{ "licenseNumber": "CUL000030", "licenseName": "..." }, ...]
    licenses JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- null = sync every licence the login sees; else the licence numbers to sync.
    sync_licenses JSONB,

    last_verified_at TIMESTAMP WITH TIME ZONE,
    last_synced_at TIMESTAMP WITH TIME ZONE,
    last_error TEXT,
    last_error_at TIMESTAMP WITH TIME ZONE,

    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_metrc_connections_active ON metrc_connections(status) WHERE status = 'active';
