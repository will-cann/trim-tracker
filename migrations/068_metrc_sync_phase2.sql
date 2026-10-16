-- Metrc sync via T3 — phase 2 (plant batches, harvests, plants)
-- Migration: 068_metrc_sync_phase2
--
-- 067 already added metrc_id / metrc_license / metrc_last_modified /
-- metrc_synced_at to plants, plant_batches and harvests. This adds what the
-- phase-2 upserts need on top: synced harvests have no NeuroCann author, and
-- harvests match on Metrc id (names are not unique in NeuroCann).

-- Synced harvests have no author, same as packages in 067.
ALTER TABLE harvests ALTER COLUMN created_by DROP NOT NULL;

-- Harvests upsert on Metrc id. Plants (label) and plant batches (name) already
-- have the unique keys their upserts use; these indexes make metrc_id lookups
-- cheap and guarantee one row per Metrc record.
CREATE UNIQUE INDEX IF NOT EXISTS idx_harvests_company_metrc_id
    ON harvests(company_id, metrc_id) WHERE metrc_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_plants_company_metrc_id
    ON plants(company_id, metrc_id) WHERE metrc_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_plant_batches_company_metrc_id
    ON plant_batches(company_id, metrc_id) WHERE metrc_id IS NOT NULL;
