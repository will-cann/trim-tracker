-- METRC Item Catalog + Package METRC alignment fields
-- Migration: 039_metrc_items_and_package_fields
-- Phase 1 of METRC integration: align package creation with METRC API requirements

-- ============================================================================
-- METRC ITEMS TABLE — registered product types per license
-- METRC requires every package to reference a registered Item.
-- Items are created in METRC first, then synced here (or created here pre-sync).
-- ============================================================================
CREATE TABLE metrc_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    license_number VARCHAR(255) NOT NULL,

    -- METRC fields
    name VARCHAR(255) NOT NULL,                  -- e.g. "Flower - Wedding Cake"
    category VARCHAR(255) NOT NULL,              -- e.g. "Buds", "Concentrate", "Infused"
    strain VARCHAR(255),                         -- strain association
    unit_of_measure VARCHAR(50) NOT NULL DEFAULT 'Grams',
    package_type VARCHAR(50),                    -- maps to our PackageType

    -- Sync tracking (Phase 4)
    metrc_id BIGINT,                             -- METRC's internal ID once synced
    metrc_synced_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Each item name must be unique per license
    UNIQUE(company_id, license_number, name)
);

CREATE INDEX idx_metrc_items_company ON metrc_items(company_id);
CREATE INDEX idx_metrc_items_license ON metrc_items(company_id, license_number);

CREATE TRIGGER update_metrc_items_updated_at
    BEFORE UPDATE ON metrc_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PACKAGE TABLE ADDITIONS — METRC-required fields
-- ============================================================================

-- Reference to the METRC item catalog (replaces loose item_name for METRC-synced packages)
ALTER TABLE packages ADD COLUMN IF NOT EXISTS metrc_item_id UUID REFERENCES metrc_items(id) ON DELETE SET NULL;

-- METRC boolean flags required on package creation
ALTER TABLE packages ADD COLUMN IF NOT EXISTS is_production_batch BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS is_trade_sample BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS is_donation BOOLEAN NOT NULL DEFAULT false;

-- Source harvest name as human-readable string (METRC uses names, not UUIDs)
ALTER TABLE packages ADD COLUMN IF NOT EXISTS source_harvest_names TEXT[];

-- Source package labels as human-readable strings (for repackaging/extraction)
ALTER TABLE packages ADD COLUMN IF NOT EXISTS source_package_labels TEXT[];

-- METRC sync tracking (Phase 4)
ALTER TABLE packages ADD COLUMN IF NOT EXISTS metrc_synced_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_packages_metrc_item ON packages(metrc_item_id);
