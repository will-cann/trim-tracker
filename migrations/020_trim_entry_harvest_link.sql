-- Link trim entries to harvest batches
ALTER TABLE trim_entries
    ADD COLUMN IF NOT EXISTS harvest_id UUID REFERENCES harvests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_trim_entries_harvest ON trim_entries(harvest_id) WHERE harvest_id IS NOT NULL;
