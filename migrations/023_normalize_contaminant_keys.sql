-- =============================================================================
-- MIGRATION 023: Normalize contaminant values to snake_case keys
-- =============================================================================
-- Previously, plant contaminants were stored as display names (e.g. "Powdery mildew")
-- or inconsistently as snake_case. This normalizes all values to snake_case keys
-- so the frontend CONTAMINANT_MAP handles display formatting.
--
-- Run: node scripts/run-migration.mjs migrations/023_normalize_contaminant_keys.sql
-- =============================================================================

-- Helper: replace a display-name contaminant with its snake_case key in a text[] column
-- We use array_replace which swaps all occurrences of old value with new value.

-- Plants table
UPDATE plants SET contaminants = array_replace(contaminants, 'Spider mites', 'spider_mites') WHERE 'Spider mites' = ANY(contaminants);
UPDATE plants SET contaminants = array_replace(contaminants, 'Thrips', 'thrips') WHERE 'Thrips' = ANY(contaminants);
UPDATE plants SET contaminants = array_replace(contaminants, 'Whiteflies', 'whiteflies') WHERE 'Whiteflies' = ANY(contaminants);
UPDATE plants SET contaminants = array_replace(contaminants, 'Aphids', 'aphids') WHERE 'Aphids' = ANY(contaminants);
UPDATE plants SET contaminants = array_replace(contaminants, 'Fungus gnats', 'fungus_gnats') WHERE 'Fungus gnats' = ANY(contaminants);
UPDATE plants SET contaminants = array_replace(contaminants, 'Powdery mildew', 'powdery_mildew') WHERE 'Powdery mildew' = ANY(contaminants);
UPDATE plants SET contaminants = array_replace(contaminants, 'Botrytis', 'botrytis') WHERE 'Botrytis' = ANY(contaminants);
UPDATE plants SET contaminants = array_replace(contaminants, 'Fusarium', 'fusarium') WHERE 'Fusarium' = ANY(contaminants);
UPDATE plants SET contaminants = array_replace(contaminants, 'Verticillium', 'verticillium') WHERE 'Verticillium' = ANY(contaminants);
UPDATE plants SET contaminants = array_replace(contaminants, 'Tobacco mosaic virus', 'tobacco_mosaic_virus') WHERE 'Tobacco mosaic virus' = ANY(contaminants);
UPDATE plants SET contaminants = array_replace(contaminants, 'Root aphids', 'root_aphids') WHERE 'Root aphids' = ANY(contaminants);
UPDATE plants SET contaminants = array_replace(contaminants, 'Hops latent viroid', 'hops_latent_viroid') WHERE 'Hops latent viroid' = ANY(contaminants);
UPDATE plants SET contaminants = array_replace(contaminants, 'Other', 'other') WHERE 'Other' = ANY(contaminants);

-- Plant batches table
UPDATE plant_batches SET contaminants = array_replace(contaminants, 'Spider mites', 'spider_mites') WHERE 'Spider mites' = ANY(contaminants);
UPDATE plant_batches SET contaminants = array_replace(contaminants, 'Thrips', 'thrips') WHERE 'Thrips' = ANY(contaminants);
UPDATE plant_batches SET contaminants = array_replace(contaminants, 'Whiteflies', 'whiteflies') WHERE 'Whiteflies' = ANY(contaminants);
UPDATE plant_batches SET contaminants = array_replace(contaminants, 'Aphids', 'aphids') WHERE 'Aphids' = ANY(contaminants);
UPDATE plant_batches SET contaminants = array_replace(contaminants, 'Fungus gnats', 'fungus_gnats') WHERE 'Fungus gnats' = ANY(contaminants);
UPDATE plant_batches SET contaminants = array_replace(contaminants, 'Powdery mildew', 'powdery_mildew') WHERE 'Powdery mildew' = ANY(contaminants);
UPDATE plant_batches SET contaminants = array_replace(contaminants, 'Botrytis', 'botrytis') WHERE 'Botrytis' = ANY(contaminants);
UPDATE plant_batches SET contaminants = array_replace(contaminants, 'Fusarium', 'fusarium') WHERE 'Fusarium' = ANY(contaminants);
UPDATE plant_batches SET contaminants = array_replace(contaminants, 'Verticillium', 'verticillium') WHERE 'Verticillium' = ANY(contaminants);
UPDATE plant_batches SET contaminants = array_replace(contaminants, 'Tobacco mosaic virus', 'tobacco_mosaic_virus') WHERE 'Tobacco mosaic virus' = ANY(contaminants);
UPDATE plant_batches SET contaminants = array_replace(contaminants, 'Root aphids', 'root_aphids') WHERE 'Root aphids' = ANY(contaminants);
UPDATE plant_batches SET contaminants = array_replace(contaminants, 'Hops latent viroid', 'hops_latent_viroid') WHERE 'Hops latent viroid' = ANY(contaminants);
UPDATE plant_batches SET contaminants = array_replace(contaminants, 'Other', 'other') WHERE 'Other' = ANY(contaminants);
