-- Add default flowering days to strains for harvest date prediction
-- Created: 2026-03-27

ALTER TABLE strains ADD COLUMN IF NOT EXISTS default_flowering_days INTEGER
    CHECK (default_flowering_days IS NULL OR (default_flowering_days > 0 AND default_flowering_days <= 120));

-- Seed realistic flowering times for existing strains
UPDATE strains SET default_flowering_days = 63 WHERE LOWER(name) = 'blue dream';
UPDATE strains SET default_flowering_days = 56 WHERE LOWER(name) = 'og kush';
UPDATE strains SET default_flowering_days = 59 WHERE LOWER(name) = 'gelato';
UPDATE strains SET default_flowering_days = 63 WHERE LOWER(name) = 'wedding cake';
UPDATE strains SET default_flowering_days = 56 WHERE LOWER(name) = 'purple punch';
UPDATE strains SET default_flowering_days = 56 WHERE LOWER(name) = 'zkittlez';

-- Track migration
INSERT INTO schema_migrations (version) VALUES (9)
ON CONFLICT (version) DO NOTHING;
