-- Allow packages to reach zero quantity (fully consumed by extraction runs, etc.)
-- The old CHECK (quantity > 0) constraint prevented legitimate consumption workflows.

ALTER TABLE packages DROP CONSTRAINT IF EXISTS packages_quantity_check;
ALTER TABLE packages ADD CONSTRAINT packages_quantity_check CHECK (quantity >= 0);
