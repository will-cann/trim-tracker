-- Product type catalog — open the package_type universe
-- Migration: 046_product_type_catalog
--
-- Replaces the closed CHECK constraint on packages.package_type with a
-- company-scoped catalog of product types. Implements the guiding principle:
-- "any package can theoretically be used in creating another package."
--
-- The packages.package_type column stays as VARCHAR and references
-- product_types.name by convention (no FK so deletes are safe and legacy
-- values don't break). Validation is enforced at the application layer with
-- a soft warning if a value isn't in the catalog.

-- ============================================================================
-- product_types catalog table
-- ============================================================================
CREATE TABLE IF NOT EXISTS product_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

    -- Stable machine name used by package_type, AI tool inputs, and joins.
    -- Snake-case, lowercase, no spaces.
    name VARCHAR(100) NOT NULL,

    -- Human-readable label for UI dropdowns and labels
    display_name VARCHAR(150) NOT NULL,

    -- Lifecycle category — drives sorting, filtering, and which workflows the type appears in
    --   biomass       → harvested plant material (flower, trim, fresh frozen, etc.)
    --   intermediate  → mid-pipeline products (bubble hash, distillate, rosin)
    --   finished      → end products ready for sale (carts, prerolls, edibles)
    --   additive      → ingredients added to other products (cannabis or non-cannabis terpenes, flavoring)
    category VARCHAR(50) NOT NULL CHECK (category IN ('biomass', 'intermediate', 'finished', 'additive')),

    -- Default unit when this type is used as input/output ('g', 'each', 'ml', 'trays', etc.)
    -- Per-step overrides will live on process_steps in P2.
    default_unit VARCHAR(20) NOT NULL DEFAULT 'g',

    -- Cannabis vs non-cannabis flag — drives METRC compliance filtering and license inheritance.
    -- Non-cannabis examples: botanical terpenes, flavoring, butane.
    is_cannabis BOOLEAN NOT NULL DEFAULT true,

    -- Optional METRC item category mapping for compliance export
    metrc_item_category VARCHAR(100),

    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER DEFAULT 100,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(company_id, name)
);

CREATE INDEX IF NOT EXISTS idx_product_types_company ON product_types(company_id);
CREATE INDEX IF NOT EXISTS idx_product_types_company_active ON product_types(company_id, is_active);

CREATE TRIGGER update_product_types_updated_at BEFORE UPDATE ON product_types
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Drop the closed enum on packages.package_type
-- ============================================================================
-- The CHECK constraint hardcoded 7 values which made distillate, live_resin,
-- live_rosin, terpenes, etc. unstorable. Validation moves to the app layer.
ALTER TABLE packages DROP CONSTRAINT IF EXISTS packages_package_type_check;

-- ============================================================================
-- Seed the catalog for every existing company
-- ============================================================================
-- The seed covers the historical 7 + the obvious extras Larry's terpene-distillate
-- workflow needs. Companies can add more via the upsert endpoint.
INSERT INTO product_types (company_id, name, display_name, category, default_unit, is_cannabis, sort_order)
SELECT c.id, t.name, t.display_name, t.category, t.default_unit, t.is_cannabis, t.sort_order
FROM companies c
CROSS JOIN (VALUES
    -- Biomass
    ('flower',             'Flower',                      'biomass',      'g',    true,   10),
    ('trim',               'Trim',                        'biomass',      'g',    true,   20),
    ('shake',              'Shake',                       'biomass',      'g',    true,   30),
    ('fresh_frozen',       'Fresh Frozen',                'biomass',      'g',    true,   40),
    ('dry_trim',           'Dry Trim',                    'biomass',      'g',    true,   50),
    ('kief',               'Kief',                        'biomass',      'g',    true,   60),
    -- Intermediates
    ('bubble_hash',        'Bubble Hash',                 'intermediate', 'g',    true,  100),
    ('rosin',              'Rosin',                       'intermediate', 'g',    true,  110),
    ('live_rosin',         'Live Rosin',                  'intermediate', 'g',    true,  120),
    ('distillate',         'Distillate',                  'intermediate', 'g',    true,  130),
    ('live_resin',         'Live Resin',                  'intermediate', 'g',    true,  140),
    -- Finished
    ('rosin_cart',         'Rosin Cart',                  'finished',     'each', true,  200),
    ('live_rosin_cart',    'Live Rosin Cart',             'finished',     'each', true,  210),
    ('distillate_cart',    'Distillate Cart',             'finished',     'each', true,  220),
    ('live_resin_cart',    'Live Resin Cart',             'finished',     'each', true,  230),
    -- Additives — used in infusion/blending workflows
    ('terpenes_cannabis',  'Terpenes (cannabis-derived)', 'additive',     'ml',   true,  300),
    ('terpenes_botanical', 'Terpenes (botanical)',        'additive',     'ml',   false, 310)
) AS t(name, display_name, category, default_unit, is_cannabis, sort_order)
ON CONFLICT (company_id, name) DO NOTHING;
