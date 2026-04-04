-- ============================================================================
-- 033: Generalize process_templates + process_steps for cultivation SOPs
-- ============================================================================
-- Extends the extraction-specific SOP tables to support cultivation and other
-- operational domains. All new columns are nullable so existing extraction
-- templates continue to work unchanged.

-- ── process_templates: add domain + phase durations ────���────────────────────

ALTER TABLE process_templates
    ADD COLUMN IF NOT EXISTS domain VARCHAR(100) DEFAULT 'extraction',
    ADD COLUMN IF NOT EXISTS phase_durations JSONB;
    -- e.g. { "nursery": 2, "vegetative": 4, "flowering": 9, "drying": 2 }

CREATE INDEX IF NOT EXISTS idx_process_templates_domain ON process_templates(domain);

-- ── process_steps: add cultivation track/phase positioning ──────────────────

ALTER TABLE process_steps
    ADD COLUMN IF NOT EXISTS track VARCHAR(50),
    -- 'feeding', 'ipm', 'training', 'environment', 'milestone'

    ADD COLUMN IF NOT EXISTS phase VARCHAR(50),
    -- 'nursery', 'vegetative', 'flowering', 'drying'

    ADD COLUMN IF NOT EXISTS phase_week INTEGER,
    -- week number within phase (1-indexed)

    ADD COLUMN IF NOT EXISTS phase_day INTEGER,
    -- optional day within phase for precise timing

    ADD COLUMN IF NOT EXISTS is_span BOOLEAN DEFAULT false,
    -- true for environment targets, no-spray zones

    ADD COLUMN IF NOT EXISTS span_end_week INTEGER,
    -- end week for span events (within same phase)

    ADD COLUMN IF NOT EXISTS env_targets JSONB,
    -- { tempDay, tempNight, humidity, co2, vpd, light, ppfd }

    ADD COLUMN IF NOT EXISTS task_category VARCHAR(50),
    -- maps to human_tasks.category for task generation

    ADD COLUMN IF NOT EXISTS on_complete_action JSONB,
    -- ProposedAction auto-executed when step is marked done

    ADD COLUMN IF NOT EXISTS requires_supplies TEXT[],
    -- consumables needed for this step

    ADD COLUMN IF NOT EXISTS is_critical BOOLEAN DEFAULT false,
    -- compliance gates that cannot be skipped

    ADD COLUMN IF NOT EXISTS recurrence JSONB;
    -- { everyWeeks: 1 } for repeating events within a phase
