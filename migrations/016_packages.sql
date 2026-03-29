-- Package Inventory Module - Database Schema
-- Migration: 016_packages
-- Adds package tracking for final saleable units created from trim entries

-- ============================================================================
-- PACKAGES TABLE
-- ============================================================================
CREATE TABLE packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES users(id),
    harvest_id UUID REFERENCES harvests(id) ON DELETE SET NULL,
    trim_entry_id UUID REFERENCES trim_entries(id) ON DELETE SET NULL,
    tag_id UUID REFERENCES tags(id) ON DELETE SET NULL,
    label VARCHAR(255) NOT NULL,
    package_type VARCHAR(50) NOT NULL
        CHECK (package_type IN ('flower', 'trim', 'shake')),
    item_name VARCHAR(255),
    strain VARCHAR(255) NOT NULL,
    license_number VARCHAR(255) NOT NULL,
    quantity DECIMAL(10,2) NOT NULL CHECK (quantity > 0),
    unit VARCHAR(20) NOT NULL DEFAULT 'Grams',
    waste_weight DECIMAL(10,2) DEFAULT 0,
    location VARCHAR(255),
    notes TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'on_hold', 'finished', 'archived')),
    lab_testing_state VARCHAR(50) DEFAULT 'not_submitted'
        CHECK (lab_testing_state IN ('not_submitted', 'submitted', 'passed', 'failed')),
    packaged_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    finished_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX idx_packages_company ON packages(company_id);
CREATE INDEX idx_packages_company_status ON packages(company_id, status);
CREATE INDEX idx_packages_harvest ON packages(harvest_id);
CREATE INDEX idx_packages_trim_entry ON packages(trim_entry_id);

-- ============================================================================
-- TRIGGER
-- ============================================================================
CREATE TRIGGER update_packages_updated_at
    BEFORE UPDATE ON packages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
