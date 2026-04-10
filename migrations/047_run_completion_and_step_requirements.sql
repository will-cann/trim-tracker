-- Run lifecycle: schedule-driven model with opportunistic weight check-ins and
-- explicit finalization. Replaces the "click every step" interaction model with
-- composable step requirements (requires_weight, requires_timestamp) that drive
-- UI rendering. See `extraction-workflows-rebaseline.md` and `p2-p3-run-lifecycle.md`
-- in ~/.claude/plans/ for the full design rationale.
--
-- Migration: 047_run_completion_and_step_requirements

-- ============================================================================
-- process_steps — composable step requirements
-- ============================================================================
-- Each step can independently require: a weight check-in, a timestamp capture,
-- and/or equipment (equipment_type already exists from 028). Duration already
-- exists as est_duration_hours. A step with no flags set is a pure "action" step
-- the operator just does without clicking anything.

ALTER TABLE process_steps
    ADD COLUMN IF NOT EXISTS requires_weight BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS weight_unit VARCHAR(20),
    ADD COLUMN IF NOT EXISTS requires_timestamp BOOLEAN NOT NULL DEFAULT false;

-- weight_unit is only meaningful when requires_weight=true. Supported values at
-- the application layer: 'g' | 'kg' | 'mg' | 'lb' | 'oz' | 'ml' | 'L' | 'each' | 'trays'.
-- No DB-level CHECK constraint — product_types.default_unit (from migration 046)
-- already validates units loosely at the app layer, and we want to allow future
-- extensions without schema churn.

COMMENT ON COLUMN process_steps.requires_weight IS 'If true, operator must enter a numeric value at this step before the run can finalize.';
COMMENT ON COLUMN process_steps.weight_unit IS 'Unit for the weight check-in (g, kg, ml, each, trays, etc.). Only meaningful when requires_weight=true.';
COMMENT ON COLUMN process_steps.requires_timestamp IS 'If true, operator enters a datetime for this step (e.g. cure start time) as a reference point for reports.';

-- ============================================================================
-- extraction_run_steps — runtime check-in values
-- ============================================================================
-- New columns hold the operator's entered values. Legacy input_weight_g /
-- output_weight_g columns stay for backwards-compat reads on old runs.
-- New runs write to check_in_value + check_in_unit.

ALTER TABLE extraction_run_steps
    ADD COLUMN IF NOT EXISTS check_in_value NUMERIC,
    ADD COLUMN IF NOT EXISTS check_in_unit VARCHAR(20),
    ADD COLUMN IF NOT EXISTS timestamp_captured_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN extraction_run_steps.check_in_value IS 'Numeric value the operator entered at this step (weight, count, etc.). Paired with check_in_unit.';
COMMENT ON COLUMN extraction_run_steps.check_in_unit IS 'Unit for the check-in value, cached from process_steps.weight_unit at run time or overridden.';
COMMENT ON COLUMN extraction_run_steps.timestamp_captured_at IS 'Operator-entered timestamp for steps with requires_timestamp=true. Defaults to now on entry but editable.';

-- ============================================================================
-- extraction_run_outputs — multi-output support
-- ============================================================================
-- One completed run can produce multiple distinct output packages (e.g. live
-- rosin + leftover kief fraction). This join table links the run to each
-- created output package with a stable ordering from the Finish Run modal.
-- Populated by the completion hook in update-extraction-run.ts when status
-- transitions to 'completed'.

CREATE TABLE IF NOT EXISTS extraction_run_outputs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES extraction_runs(id) ON DELETE CASCADE,
    package_id UUID NOT NULL REFERENCES packages(id) ON DELETE RESTRICT,
    sequence INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(run_id, package_id)
);

CREATE INDEX IF NOT EXISTS idx_extraction_run_outputs_run ON extraction_run_outputs(run_id);
CREATE INDEX IF NOT EXISTS idx_extraction_run_outputs_package ON extraction_run_outputs(package_id);

COMMENT ON TABLE extraction_run_outputs IS 'Join table mapping completed extraction runs to the output packages they produced. One-to-many — a run can create multiple outputs (e.g. rosin + kief fraction).';
COMMENT ON COLUMN extraction_run_outputs.sequence IS 'Display order from the Finish Run modal, 0-indexed.';

-- ============================================================================
-- extraction_runs — idempotency gate for the completion hook
-- ============================================================================
-- The completion hook in update-extraction-run.ts reads this column before
-- running its side effects (decrement sources, create output packages, write
-- extraction_logs). If sources_consumed_at IS NOT NULL, the hook skips — this
-- prevents double-decrement on retries or accidental re-submission.

ALTER TABLE extraction_runs
    ADD COLUMN IF NOT EXISTS sources_consumed_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN extraction_runs.sources_consumed_at IS 'Set to NOW() by the completion hook after source packages have been decremented and output packages created. NULL means the hook has not run for this run (idempotency gate).';
