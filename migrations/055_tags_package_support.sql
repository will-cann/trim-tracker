-- Migration 055: Add package support to tags system
-- Extends tags table so METRC tags can be assigned to packages,
-- not just plants and batches.

-- 1. Add 'package' to the tag_type check constraint
ALTER TABLE tags DROP CONSTRAINT IF EXISTS tags_tag_type_check;
ALTER TABLE tags ADD CONSTRAINT tags_tag_type_check
    CHECK (tag_type IN ('plant', 'batch', 'package'));

-- 2. Add assigned_to_package_id column
ALTER TABLE tags ADD COLUMN IF NOT EXISTS
    assigned_to_package_id UUID REFERENCES packages(id) ON DELETE SET NULL;

-- 3. Index for reverse lookup (find tag by package)
CREATE INDEX IF NOT EXISTS idx_tags_package
    ON tags(assigned_to_package_id) WHERE assigned_to_package_id IS NOT NULL;
