-- Migration 018: Harvest Day workflow
-- Adds per-plant weight tracking, batch contamination flags, dry weight,
-- submission/approval tracking, and 'submitted' harvest status.

-- ============================================================
-- 1. Per-plant weight tracking
-- ============================================================

CREATE TABLE harvest_plant_weights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    harvest_id UUID NOT NULL REFERENCES harvests(id) ON DELETE CASCADE,
    plant_number INTEGER NOT NULL,
    weight DECIMAL(10,2) NOT NULL CHECK (weight > 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_harvest_plant_weights_harvest ON harvest_plant_weights(harvest_id);
CREATE UNIQUE INDEX idx_harvest_plant_weights_unique ON harvest_plant_weights(harvest_id, plant_number);

-- ============================================================
-- 2. Harvest extensions
-- ============================================================

-- Batch contamination flags (metadata, not waste weight)
-- Uses TEXT[] to match existing pattern on plants and plant_batches tables
ALTER TABLE harvests ADD COLUMN contaminants TEXT[] NOT NULL DEFAULT '{}';

-- Dry weight: recorded after drying, becomes starting weight for trim
ALTER TABLE harvests ADD COLUMN dry_weight DECIMAL(10,2);

-- Two-phase submit: crew submits, admin approves
ALTER TABLE harvests ADD COLUMN submitted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE harvests ADD COLUMN approved_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE harvests ADD COLUMN approved_by UUID REFERENCES users(id);

-- Add 'submitted' status between 'active' and 'drying'
ALTER TABLE harvests DROP CONSTRAINT IF EXISTS harvests_status_check;
ALTER TABLE harvests ADD CONSTRAINT harvests_status_check
    CHECK (status IN ('planning', 'active', 'submitted', 'drying', 'ready', 'completed'));

-- ============================================================
-- 3. Package contamination inheritance
-- ============================================================

-- When fresh frozen packages are created from a contaminated batch,
-- the contaminant flags carry over as metadata
ALTER TABLE packages ADD COLUMN contaminants TEXT[] NOT NULL DEFAULT '{}';
