-- ============================================================================
-- 028: Extraction Equipment + Process Templates
-- ============================================================================

-- ── Equipment ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS extraction_equipment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    equipment_type VARCHAR(100) NOT NULL,  -- freeze_dryer, rosin_press, closed_loop_extractor, vacuum_oven, cart_filler, wash_vessel, etc.
    capacity_grams DECIMAL(10,2),          -- max input capacity in grams (null if not applicable)
    capacity_unit VARCHAR(50) DEFAULT 'g', -- g, ml, etc.
    notes TEXT,                            -- column sizes, temp ranges, brand/model, etc.
    status VARCHAR(50) DEFAULT 'available' CHECK (status IN ('available', 'in_use', 'maintenance', 'retired')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_extraction_equipment_company ON extraction_equipment(company_id);

-- ── Process Templates ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS process_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    process_type VARCHAR(100) NOT NULL,    -- solventless, bho, distillate, custom
    is_preset BOOLEAN DEFAULT false,       -- true for system-provided templates
    accepted_inputs TEXT[] DEFAULT '{}',      -- which input material types this process accepts (fresh_frozen, dry_trim, flower, etc.)
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_process_templates_company ON process_templates(company_id);

-- ── Process Steps ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS process_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES process_templates(id) ON DELETE CASCADE,
    step_order INTEGER NOT NULL,
    name VARCHAR(255) NOT NULL,            -- "Wash", "Freeze Dry", "Press", "Decarb", "Fill", "Package"
    description TEXT,                      -- SOP instructions, temps, micron sizes, durations
    input_type VARCHAR(100),               -- package type expected as input (fresh_frozen, bubble_hash, rosin, etc.)
    output_type VARCHAR(100),              -- package type produced as output
    equipment_type VARCHAR(100),           -- type of equipment needed (matches extraction_equipment.equipment_type)
    expected_yield_pct DECIMAL(5,2),       -- expected yield percentage for this step
    est_duration_hours DECIMAL(6,2),       -- estimated duration in hours
    is_optional BOOLEAN DEFAULT false,     -- true for steps that can be skipped (e.g. decarb for non-edible rosin)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(template_id, step_order)
);

CREATE INDEX IF NOT EXISTS idx_process_steps_template ON process_steps(template_id);
