-- Strain Registry
-- Tracks all strains used across harvests and trim sessions
-- Created: 2026-03-25

-- ============================================================================
-- STRAINS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS strains (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_strains_company_id ON strains(company_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_strains_company_name ON strains(company_id, LOWER(name));

CREATE TRIGGER update_strains_updated_at BEFORE UPDATE ON strains
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- BACKFILL: Capture existing strains from harvests and trim entries
-- ============================================================================
INSERT INTO strains (company_id, name)
SELECT DISTINCT h.company_id, h.strain
FROM harvests h
WHERE h.strain IS NOT NULL AND h.strain != ''
ON CONFLICT (company_id, LOWER(name)) DO NOTHING;

-- Also capture from trim entries via sessions
INSERT INTO strains (company_id, name)
SELECT DISTINCT ts.company_id, te.strain
FROM trim_entries te
JOIN trim_sessions ts ON te.session_id = ts.id
WHERE te.strain IS NOT NULL AND te.strain != ''
ON CONFLICT (company_id, LOWER(name)) DO NOTHING;

-- Track migration
INSERT INTO schema_migrations (version, name) VALUES (4, '004_add_strains')
ON CONFLICT (version) DO NOTHING;
