-- Add fresh_frozen as a package type
-- Migration: 017_add_fresh_frozen_package_type

ALTER TABLE packages DROP CONSTRAINT IF EXISTS packages_package_type_check;
ALTER TABLE packages ADD CONSTRAINT packages_package_type_check
    CHECK (package_type IN ('flower', 'trim', 'shake', 'fresh_frozen'));
