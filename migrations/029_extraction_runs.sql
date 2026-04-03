-- ============================================================================
-- 029: Extraction Runs — track live processing through template steps
-- ============================================================================

CREATE TABLE IF NOT EXISTS extraction_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    template_id UUID REFERENCES process_templates(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,               -- user label, e.g. "OGK Solventless Run #4"
    strain VARCHAR(255),                      -- strain being processed
    input_material VARCHAR(100),              -- starting material type: fresh_frozen, dry_trim, bubble_hash, etc. (auto-set from template step 1)
    target_product VARCHAR(100),              -- output product variant: shatter, wax, diamonds, sugar, live_rosin, etc.
    status VARCHAR(50) DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'completed', 'cancelled')),
    planned_start TIMESTAMP WITH TIME ZONE,   -- when the user plans to begin this run
    source_package_id UUID,                   -- optional: input package from inventory (first source)
    parent_run_id UUID REFERENCES extraction_runs(id) ON DELETE SET NULL,  -- for batch splits/forks
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_extraction_runs_company ON extraction_runs(company_id);
CREATE INDEX IF NOT EXISTS idx_extraction_runs_status ON extraction_runs(company_id, status);
CREATE INDEX IF NOT EXISTS idx_extraction_runs_template ON extraction_runs(template_id);

-- ── Run Steps — one row per step in a run ─────────────────────────────────

CREATE TABLE IF NOT EXISTS extraction_run_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES extraction_runs(id) ON DELETE CASCADE,
    template_step_id UUID REFERENCES process_steps(id) ON DELETE SET NULL,
    step_order INTEGER NOT NULL,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed', 'skipped')),
    input_weight_g DECIMAL(10,2),             -- actual input weight in grams
    output_weight_g DECIMAL(10,2),            -- actual output weight in grams
    yield_pct DECIMAL(5,2),                   -- calculated: (output / input) * 100
    equipment_id UUID REFERENCES extraction_equipment(id) ON DELETE SET NULL,
    is_optional BOOLEAN DEFAULT false,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_extraction_run_steps_run ON extraction_run_steps(run_id);

-- ── Source Packages — links runs to their input packages ──────────────────

CREATE TABLE IF NOT EXISTS extraction_run_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES extraction_runs(id) ON DELETE CASCADE,
    package_id UUID NOT NULL,                 -- references packages table
    quantity_used DECIMAL(10,2),              -- how much of this package was used (null = all)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(run_id, package_id)
);

CREATE INDEX IF NOT EXISTS idx_extraction_run_sources_run ON extraction_run_sources(run_id);
