-- Migration 013: Add default vegetative days to strains
ALTER TABLE strains ADD COLUMN IF NOT EXISTS default_veg_days INTEGER
    CHECK (default_veg_days IS NULL OR (default_veg_days > 0 AND default_veg_days <= 120));
