-- 037_harvest_status_migration.sql
-- Migrates existing harvest statuses to the new pipeline values.
-- Old: planning, active, submitted, drying, ready, completed
-- New: planning, cutting, submitted, hanging, bucking, completed

-- Map old statuses to new
UPDATE harvests SET status = 'cutting' WHERE status = 'active';
UPDATE harvests SET status = 'hanging' WHERE status = 'drying';
UPDATE harvests SET status = 'bucking' WHERE status = 'ready';

-- Tighten the constraint now that old data is migrated
ALTER TABLE harvests DROP CONSTRAINT IF EXISTS harvests_status_check;
ALTER TABLE harvests ADD CONSTRAINT harvests_status_check
  CHECK (status IN ('planning', 'cutting', 'submitted', 'hanging', 'bucking', 'completed'));
