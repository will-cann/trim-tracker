-- Metrc sync via T3 — phase 1 schema (docs/briefs/t3-metrc-sync-brief.md)
-- Migration: 067_metrc_sync
--
-- Lets a background job mirror Metrc's items, strains, locations and packages
-- into NeuroCann for one company, and later (phase 2) plants, plant batches and
-- harvests. Every synced row keeps Metrc's id, licence and last-modified stamp
-- so re-runs are idempotent upserts and NeuroCann-owned columns are untouched.

-- ============================================================================
-- 1. packages — match on tag, carry Metrc's identity, allow in-transit
-- ============================================================================

-- A package label is a Metrc tag and must be unique per company for the upsert.
-- Refuse to proceed if hand-entered duplicates exist; they need a human decision.
DO $$
DECLARE
    dup RECORD;
    dups TEXT := '';
BEGIN
    FOR dup IN
        SELECT company_id, label, COUNT(*) AS n
        FROM packages
        GROUP BY company_id, label
        HAVING COUNT(*) > 1
        LIMIT 10
    LOOP
        dups := dups || format(' [company %s label %s x%s]', dup.company_id, dup.label, dup.n);
    END LOOP;
    IF dups <> '' THEN
        RAISE EXCEPTION 'packages has duplicate (company_id, label) rows; merge or relabel them before syncing with Metrc:%', dups;
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_packages_company_label ON packages(company_id, label);

ALTER TABLE packages ADD COLUMN IF NOT EXISTS metrc_id BIGINT;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS metrc_license VARCHAR(64);
ALTER TABLE packages ADD COLUMN IF NOT EXISTS metrc_last_modified TIMESTAMP WITH TIME ZONE;
-- Metrc's raw lab testing state (TestPassed, NotRequired, SubmittedForTesting, …);
-- lab_testing_state stays the four-value summary the UI understands.
ALTER TABLE packages ADD COLUMN IF NOT EXISTS metrc_lab_state TEXT;

CREATE INDEX IF NOT EXISTS idx_packages_metrc_id ON packages(company_id, metrc_id) WHERE metrc_id IS NOT NULL;

-- Metrc packages can be in transit; nothing in NeuroCann produced that state before.
ALTER TABLE packages DROP CONSTRAINT IF EXISTS packages_status_check;
ALTER TABLE packages ADD CONSTRAINT packages_status_check
    CHECK (status IN ('active', 'on_hold', 'in_transit', 'finished', 'archived'));

-- Synced rows have no NeuroCann author. Reads LEFT JOIN users where they need a name.
ALTER TABLE packages ALTER COLUMN created_by DROP NOT NULL;

-- ============================================================================
-- 2. Reference tables — strains, rooms (Metrc locations), metrc_items
-- ============================================================================
ALTER TABLE strains ADD COLUMN IF NOT EXISTS metrc_id BIGINT;
ALTER TABLE strains ADD COLUMN IF NOT EXISTS metrc_license VARCHAR(64);
ALTER TABLE strains ADD COLUMN IF NOT EXISTS metrc_last_modified TIMESTAMP WITH TIME ZONE;
ALTER TABLE strains ADD COLUMN IF NOT EXISTS metrc_synced_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE rooms ADD COLUMN IF NOT EXISTS metrc_id BIGINT;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS metrc_license VARCHAR(64);
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS metrc_last_modified TIMESTAMP WITH TIME ZONE;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS metrc_synced_at TIMESTAMP WITH TIME ZONE;

-- metrc_items already has metrc_id / metrc_synced_at (040) and license_number.
ALTER TABLE metrc_items ADD COLUMN IF NOT EXISTS metrc_last_modified TIMESTAMP WITH TIME ZONE;

-- ============================================================================
-- 3. Phase-2 tables get the same identity columns now so one migration covers
--    the sync. Nothing writes them until plants/harvests sync lands.
-- ============================================================================
ALTER TABLE plants ADD COLUMN IF NOT EXISTS metrc_id BIGINT;
ALTER TABLE plants ADD COLUMN IF NOT EXISTS metrc_license VARCHAR(64);
ALTER TABLE plants ADD COLUMN IF NOT EXISTS metrc_last_modified TIMESTAMP WITH TIME ZONE;
ALTER TABLE plants ADD COLUMN IF NOT EXISTS metrc_synced_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE plant_batches ADD COLUMN IF NOT EXISTS metrc_id BIGINT;
ALTER TABLE plant_batches ADD COLUMN IF NOT EXISTS metrc_license VARCHAR(64);
ALTER TABLE plant_batches ADD COLUMN IF NOT EXISTS metrc_last_modified TIMESTAMP WITH TIME ZONE;
ALTER TABLE plant_batches ADD COLUMN IF NOT EXISTS metrc_synced_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE harvests ADD COLUMN IF NOT EXISTS metrc_id BIGINT;
ALTER TABLE harvests ADD COLUMN IF NOT EXISTS metrc_license VARCHAR(64);
ALTER TABLE harvests ADD COLUMN IF NOT EXISTS metrc_last_modified TIMESTAMP WITH TIME ZONE;
ALTER TABLE harvests ADD COLUMN IF NOT EXISTS metrc_synced_at TIMESTAMP WITH TIME ZONE;

-- ============================================================================
-- 4. Sync bookkeeping
-- ============================================================================

-- One cursor per (company, licence, T3 list). Only advanced when that list
-- finished cleanly, so a failed page is re-read next run.
CREATE TABLE IF NOT EXISTS metrc_sync_state (
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    license_number VARCHAR(64) NOT NULL,
    list VARCHAR(64) NOT NULL,                       -- e.g. 'packages/active'
    cursor TIMESTAMP WITH TIME ZONE,                 -- Metrc lastModified high-water mark
    last_success_at TIMESTAMP WITH TIME ZONE,
    last_error TEXT,
    last_error_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (company_id, license_number, list)
);

-- One row per run, for the Settings panel and for the "one run at a time" lock.
CREATE TABLE IF NOT EXISTS metrc_sync_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    trigger VARCHAR(20) NOT NULL CHECK (trigger IN ('schedule', 'manual')),
    status VARCHAR(20) NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'running', 'succeeded', 'partial', 'failed', 'skipped')),
    started_by UUID REFERENCES users(id) ON DELETE SET NULL,
    dry_run BOOLEAN NOT NULL DEFAULT false,
    queued_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    finished_at TIMESTAMP WITH TIME ZONE,
    -- { "<licence>": { "<list>": { "fetched": n, "inserted": n, "updated": n, "unchanged": n } } }
    counts JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- [ { "license": "...", "list": "...", "message": "..." } ]
    errors JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Dry-run / first-run report: tag matches and conflicts with hand-entered rows
    report JSONB,
    error TEXT
);

CREATE INDEX IF NOT EXISTS idx_metrc_sync_runs_company ON metrc_sync_runs(company_id, queued_at DESC);
-- The lock: at most one running sync per company. Stale 'running' rows are
-- failed by the runner before it claims, so a killed lambda can't wedge this.
CREATE UNIQUE INDEX IF NOT EXISTS idx_metrc_sync_runs_one_running
    ON metrc_sync_runs(company_id) WHERE status = 'running';
