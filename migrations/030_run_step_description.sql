-- Add description column to extraction_run_steps
-- Copied from template's process_steps.description at run creation
-- Editable per-run so users can customize SOP instructions
ALTER TABLE extraction_run_steps ADD COLUMN IF NOT EXISTS description TEXT;

-- Backfill existing steps from their template steps
UPDATE extraction_run_steps s
SET description = ps.description
FROM process_steps ps
WHERE s.template_step_id = ps.id
  AND s.description IS NULL;
