-- Migration 019: Link harvests to source plant batches
-- Harvests are created from flowering plants, not from thin air.

ALTER TABLE harvests ADD COLUMN source_batch_id UUID REFERENCES plant_batches(id);
CREATE INDEX idx_harvests_source_batch ON harvests(source_batch_id) WHERE source_batch_id IS NOT NULL;
