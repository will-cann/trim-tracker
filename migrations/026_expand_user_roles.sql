-- Migration 026: Expand users.role to support full RBAC hierarchy
-- and ensure trimmer_profiles can link to users

-- Drop the old CHECK constraint and add new one with all 4 roles
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
    CHECK (role IN ('admin', 'manager', 'lead', 'worker'));

-- Add user_id column to trimmer_profiles if not exists (links profile to login account)
ALTER TABLE trimmer_profiles
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_trimmer_profiles_user_id
    ON trimmer_profiles(user_id) WHERE user_id IS NOT NULL;
