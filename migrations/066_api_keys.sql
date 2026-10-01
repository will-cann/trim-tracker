-- ============================================================================
-- Migration: 066_api_keys
-- Personal API keys for the NeuroCann LLM plugin (MCP server at /mcp).
--
-- Keys are shown once at creation and stored only as a SHA-256 hash. The
-- key_prefix (first 12 chars) is kept in plaintext so users can recognise
-- which key is which in the settings UI.
-- ============================================================================

CREATE TABLE IF NOT EXISTS api_keys (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name          VARCHAR(255) NOT NULL,
    key_prefix    VARCHAR(16) NOT NULL,
    key_hash      CHAR(64) NOT NULL UNIQUE,
    scopes        TEXT[] NOT NULL DEFAULT '{read}',
    last_used_at  TIMESTAMP WITH TIME ZONE,
    revoked_at    TIMESTAMP WITH TIME ZONE,
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_company ON api_keys(company_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
