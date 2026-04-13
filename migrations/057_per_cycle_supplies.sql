-- Add per-cycle supply scaling mode.
-- Three modes: fixed (once per run), per_output (× output count), per_cycle (× equipment cycles).
-- The per_cycle mode enables supplies like rosin bags to scale with
-- ceil(input_g / equipment_capacity) rather than being consumed once per run.

ALTER TABLE step_supply_requirements
    ADD COLUMN IF NOT EXISTS scaling_mode TEXT NOT NULL DEFAULT 'fixed'
    CHECK (scaling_mode IN ('fixed', 'per_output', 'per_cycle'));

-- Backfill from existing boolean
UPDATE step_supply_requirements
SET scaling_mode = 'per_output'
WHERE scales_with_output = true AND scaling_mode = 'fixed';
