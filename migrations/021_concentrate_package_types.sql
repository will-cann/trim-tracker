-- Add concentrate package types for extraction workflow
-- Migration: 021_concentrate_package_types

-- Expand package_type constraint to include concentrate products
ALTER TABLE packages DROP CONSTRAINT IF EXISTS packages_package_type_check;
ALTER TABLE packages ADD CONSTRAINT packages_package_type_check
    CHECK (package_type IN ('flower', 'trim', 'shake', 'fresh_frozen', 'bubble_hash', 'rosin', 'rosin_cart'));

-- Add source_package_id for extraction lineage tracking
ALTER TABLE packages ADD COLUMN IF NOT EXISTS source_package_id UUID REFERENCES packages(id) ON DELETE SET NULL;

-- Add input_quantity to record how much of the source was consumed
ALTER TABLE packages ADD COLUMN IF NOT EXISTS input_quantity DECIMAL(10,2);

-- Index for lineage queries
CREATE INDEX IF NOT EXISTS idx_packages_source ON packages(source_package_id);

-- ============================================================================
-- Extraction logs table — records every extraction event for analytics
-- ============================================================================
CREATE TABLE IF NOT EXISTS extraction_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES users(id),

    -- What was consumed
    source_package_id UUID REFERENCES packages(id) ON DELETE SET NULL,
    input_package_type VARCHAR(50) NOT NULL,
    input_quantity DECIMAL(10,2) NOT NULL,

    -- What was produced
    output_package_id UUID REFERENCES packages(id) ON DELETE SET NULL,
    output_package_type VARCHAR(50) NOT NULL,
    output_quantity DECIMAL(10,2),

    -- Metadata
    strain VARCHAR(255) NOT NULL,
    license_number VARCHAR(100),
    extraction_type VARCHAR(50) NOT NULL,
    yield_percentage DECIMAL(5,2),
    waste_weight DECIMAL(10,2) DEFAULT 0,
    notes TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_extraction_logs_company ON extraction_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_extraction_logs_strain ON extraction_logs(company_id, strain);
CREATE INDEX IF NOT EXISTS idx_extraction_logs_created ON extraction_logs(company_id, created_at);

CREATE TRIGGER update_extraction_logs_updated_at BEFORE UPDATE ON extraction_logs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
