-- Migration 007: Extend trimmer_profiles for team management
-- Adds role and email so profiles serve as the team roster

ALTER TABLE trimmer_profiles
    ADD COLUMN IF NOT EXISTS role VARCHAR(30) NOT NULL DEFAULT 'worker'
        CHECK (role IN ('admin', 'manager', 'lead', 'worker')),
    ADD COLUMN IF NOT EXISTS email VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_trimmer_profiles_role
    ON trimmer_profiles(company_id, role);

CREATE UNIQUE INDEX IF NOT EXISTS idx_trimmer_profiles_email
    ON trimmer_profiles(company_id, LOWER(email)) WHERE email IS NOT NULL;
