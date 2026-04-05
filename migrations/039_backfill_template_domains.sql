-- Backfill NULL domain on extraction preset templates
UPDATE process_templates
SET domain = 'extraction'
WHERE domain IS NULL;
