-- Add external_id column to users for Auth0 sub claim mapping
ALTER TABLE users ADD COLUMN IF NOT EXISTS external_id VARCHAR(255) UNIQUE;

-- Index for fast lookup during auth
CREATE INDEX IF NOT EXISTS idx_users_external_id ON users(external_id);

-- Backfill existing seed users (optional, not strictly needed)
-- UPDATE users SET external_id = id::text WHERE external_id IS NULL;
