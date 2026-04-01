-- =============================================================================
-- MIGRATION 024: Moisture loss tracking for harvest → trim workflow
-- =============================================================================
-- Adds estimated moisture loss percentage to harvests and wet weight / moisture
-- loss tracking to trim entries so the full reconciliation works:
--   flower + shake + trim + waste + moisture_loss = wet_allocation_weight
--
-- Run: node scripts/run-migration.mjs migrations/024_trim_moisture_loss.sql
-- =============================================================================

-- Default 75% moisture loss (typical cannabis drying: ~25% of wet weight remains)
ALTER TABLE harvests
    ADD COLUMN IF NOT EXISTS moisture_loss_pct DECIMAL(5,2) DEFAULT 75;

-- Track the original wet allocation weight and calculated moisture loss on each trim entry
ALTER TABLE trim_entries
    ADD COLUMN IF NOT EXISTS wet_weight DECIMAL(10,2),
    ADD COLUMN IF NOT EXISTS moisture_loss DECIMAL(10,2) DEFAULT 0;
