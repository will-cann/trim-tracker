-- Plant Map Actions - Schema adjustments
-- Migration: 011_plant_map_actions
-- Makes harvests compatible with plant-map-originated harvests,
-- adds source tracking for clone batches.

-- Allow plant-map harvests that don't have license/batch context
ALTER TABLE harvests ALTER COLUMN license_number DROP NOT NULL;
ALTER TABLE harvests ALTER COLUMN batch_id DROP NOT NULL;

-- Drop the unique index on batch_id so NULL is allowed for multiple rows
DROP INDEX IF EXISTS idx_harvests_company_batch_id;
CREATE UNIQUE INDEX idx_harvests_company_batch_id ON harvests(company_id, batch_id) WHERE batch_id IS NOT NULL;

-- Track which mother plant a clone batch originated from
ALTER TABLE plant_batches ADD COLUMN IF NOT EXISTS source_plant_id UUID REFERENCES plants(id) ON DELETE SET NULL;
