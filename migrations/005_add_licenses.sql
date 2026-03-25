-- License Management
-- Companies can have multiple licenses, users can be assigned to one or more
-- Created: 2026-03-25

-- ============================================================================
-- LICENSES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS licenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    license_number VARCHAR(255) NOT NULL,
    label VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_licenses_company_id ON licenses(company_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_licenses_company_number ON licenses(company_id, LOWER(license_number));

CREATE TRIGGER update_licenses_updated_at BEFORE UPDATE ON licenses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- USER_LICENSES JOIN TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_licenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    license_id UUID NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_licenses_unique ON user_licenses(user_id, license_id);
CREATE INDEX IF NOT EXISTS idx_user_licenses_user ON user_licenses(user_id);
CREATE INDEX IF NOT EXISTS idx_user_licenses_license ON user_licenses(license_id);

-- ============================================================================
-- BACKFILL: Extract unique license numbers from existing data
-- ============================================================================

-- From harvests
INSERT INTO licenses (company_id, license_number)
SELECT DISTINCT h.company_id, h.license_number
FROM harvests h
WHERE h.license_number IS NOT NULL AND h.license_number != ''
ON CONFLICT (company_id, LOWER(license_number)) DO NOTHING;

-- From trim entries
INSERT INTO licenses (company_id, license_number)
SELECT DISTINCT ts.company_id, te.license_number
FROM trim_entries te
JOIN trim_sessions ts ON te.session_id = ts.id
WHERE te.license_number IS NOT NULL AND te.license_number != ''
ON CONFLICT (company_id, LOWER(license_number)) DO NOTHING;

-- Auto-assign all licenses to all existing users in each company
INSERT INTO user_licenses (user_id, license_id)
SELECT u.id, l.id
FROM users u
JOIN licenses l ON l.company_id = u.company_id
ON CONFLICT (user_id, license_id) DO NOTHING;

-- Track migration
INSERT INTO schema_migrations (version) VALUES (5)
ON CONFLICT (version) DO NOTHING;
