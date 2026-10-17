-- ============================================================================
-- Migration 068: Facility metrics, computed on a schedule
-- ============================================================================
-- A daily job (netlify/functions/compute-metrics.ts, scheduled in
-- netlify.toml) writes one row per company × metric × dimension × day, so
-- trends are read from here instead of recomputed from the live tables.
-- Definitions live in code (netlify/functions/utils/metrics.ts); this table
-- is the time series. Re-running a day replaces that day's rows.
--
-- Run: node scripts/run-migration.mjs migrations/068_metric_snapshots.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS metric_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    metric_key VARCHAR(80) NOT NULL,                  -- e.g. 'plants.live', 'health.botrytis_incidence_90d'
    dimension VARCHAR(255) NOT NULL DEFAULT '',       -- '' = facility-wide; else room / strain / phase / issue
    snapshot_date DATE NOT NULL,
    value NUMERIC(16, 4) NOT NULL,
    extra JSONB,                                      -- optional breakdown behind the number
    computed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, metric_key, dimension, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_metric_snapshots_series
    ON metric_snapshots (company_id, metric_key, snapshot_date DESC);

-- One row per compute run, for the Reports page and for debugging a quiet cron.
CREATE TABLE IF NOT EXISTS metric_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE, -- NULL = all companies (scheduled)
    snapshot_date DATE NOT NULL,
    trigger VARCHAR(20) NOT NULL DEFAULT 'schedule' CHECK (trigger IN ('schedule', 'manual', 'backfill')),
    status VARCHAR(20) NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'succeeded', 'failed')),
    metrics_written INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_metric_runs_recent ON metric_runs (company_id, started_at DESC);
