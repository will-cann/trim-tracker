-- 036_harvest_bins.sql
-- Introduces harvest bins (the physical containers created during buck & bin)
-- and bin cure logs (burp/aeration tracking).

-- ── harvest_bins ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS harvest_bins (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  harvest_id      UUID NOT NULL REFERENCES harvests(id),
  bin_number      INTEGER NOT NULL,
  strain          VARCHAR(255) NOT NULL,
  license_number  VARCHAR(255),
  weight          DECIMAL(10,2),
  status          VARCHAR(20) NOT NULL DEFAULT 'curing'
                  CHECK (status IN ('curing','ready','in_trim','completed')),
  location        VARCHAR(255),
  created_by      UUID REFERENCES users(id),
  bucked_at       TIMESTAMPTZ DEFAULT NOW(),
  ready_at        TIMESTAMPTZ,
  trim_entry_id   UUID,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bins_company_status ON harvest_bins(company_id, status);
CREATE INDEX IF NOT EXISTS idx_bins_harvest ON harvest_bins(harvest_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bins_harvest_number ON harvest_bins(harvest_id, bin_number);

-- ── bin_cure_logs ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bin_cure_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bin_id            UUID NOT NULL REFERENCES harvest_bins(id) ON DELETE CASCADE,
  action            VARCHAR(30) NOT NULL CHECK (action IN ('burp','aerate','inspect','note')),
  notes             TEXT,
  moisture_reading  DECIMAL(5,2),
  recorded_by       UUID REFERENCES users(id),
  next_action_at    TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cure_logs_bin ON bin_cure_logs(bin_id, created_at);

-- ── Add bin_id to trim_entries ──────────────────────────────────────────────
ALTER TABLE trim_entries ADD COLUMN IF NOT EXISTS bin_id UUID;

-- ── Expand harvest status constraint to accept new pipeline statuses ────────
-- Allow both old and new statuses during migration period.
ALTER TABLE harvests DROP CONSTRAINT IF EXISTS harvests_status_check;
ALTER TABLE harvests ADD CONSTRAINT harvests_status_check
  CHECK (status IN (
    'planning','active','submitted','drying','ready','completed',
    'cutting','hanging','bucking'
  ));

-- ── updated_at trigger for harvest_bins ─────────────────────────────────────
CREATE OR REPLACE FUNCTION update_harvest_bins_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_harvest_bins_updated_at ON harvest_bins;
CREATE TRIGGER trg_harvest_bins_updated_at
  BEFORE UPDATE ON harvest_bins
  FOR EACH ROW EXECUTE FUNCTION update_harvest_bins_updated_at();
