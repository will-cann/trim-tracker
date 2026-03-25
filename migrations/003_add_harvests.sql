-- Harvest Module - Database Schema
-- Migration: 003_add_harvests
-- Adds harvest planning, allocation tracking, and waste management

-- ============================================================================
-- HARVESTS TABLE
-- ============================================================================
CREATE TABLE harvests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES users(id),
    batch_id VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    license_number VARCHAR(255) NOT NULL,
    strain VARCHAR(255) NOT NULL,
    plant_count INTEGER DEFAULT 0,
    total_wet_weight DECIMAL(10,2) DEFAULT 0,
    total_waste_weight DECIMAL(10,2) DEFAULT 0,
    drying_location VARCHAR(255),
    manicure_location VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'planning'
        CHECK (status IN ('planning', 'active', 'drying', 'ready', 'completed')),
    is_on_hold BOOLEAN DEFAULT FALSE,
    harvest_start_date TIMESTAMP WITH TIME ZONE,
    harvest_end_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_harvests_company_id ON harvests(company_id);
CREATE INDEX idx_harvests_company_status ON harvests(company_id, status);
CREATE INDEX idx_harvests_batch_id ON harvests(batch_id);
CREATE UNIQUE INDEX idx_harvests_company_batch_id ON harvests(company_id, batch_id);

-- ============================================================================
-- HARVEST ALLOCATIONS TABLE
-- ============================================================================
CREATE TABLE harvest_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    harvest_id UUID NOT NULL REFERENCES harvests(id) ON DELETE CASCADE,
    allocation_type VARCHAR(20) NOT NULL CHECK (allocation_type IN ('flower', 'frozen')),
    target_weight DECIMAL(10,2) NOT NULL,
    actual_weight DECIMAL(10,2) DEFAULT 0,
    trim_entry_id UUID REFERENCES trim_entries(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'in_progress', 'completed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_harvest_allocations_harvest_id ON harvest_allocations(harvest_id);
CREATE INDEX idx_harvest_allocations_trim_entry ON harvest_allocations(trim_entry_id) WHERE trim_entry_id IS NOT NULL;

-- ============================================================================
-- HARVEST WASTE TABLE
-- ============================================================================
CREATE TABLE harvest_waste (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    harvest_id UUID NOT NULL REFERENCES harvests(id) ON DELETE CASCADE,
    waste_type VARCHAR(50) NOT NULL CHECK (waste_type IN (
        'powdery_mildew', 'bud_rot', 'insects', 'other',
        'stems', 'leaves',
        'plant_material', 'fibrous', 'root_ball'
    )),
    weight DECIMAL(10,2) NOT NULL CHECK (weight > 0),
    recorded_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_harvest_waste_harvest_id ON harvest_waste(harvest_id);

-- ============================================================================
-- LINK TRIM ENTRIES BACK TO HARVESTS
-- ============================================================================
ALTER TABLE trim_entries ADD COLUMN harvest_allocation_id UUID REFERENCES harvest_allocations(id) ON DELETE SET NULL;

-- ============================================================================
-- APPLY UPDATED_AT TRIGGERS
-- ============================================================================
CREATE TRIGGER update_harvests_updated_at
    BEFORE UPDATE ON harvests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_harvest_allocations_updated_at
    BEFORE UPDATE ON harvest_allocations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
