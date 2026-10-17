-- ============================================================================
-- Migration 069: Table-granularity room maps and the bud-rot score scale
-- ============================================================================
-- The operator's room sheets track each bench position as a *table* (a tray
-- of 12–14 plants of one strain) and score bud rot per table on a 0.5 / 1 /
-- 2 / 3 scale. Metrc plants aren't tied to tables, so the map needs a
-- cell-level occupancy record alongside per-plant positions.
--
-- Run: node scripts/run-migration.mjs migrations/069_room_tables_and_rot_scores.sql
-- ============================================================================

-- ── Rooms: section labels and axis labels for the grid ──────────────────────
-- { "sections": [{ "name": "Upper Deck", "rowStart": 0, "rowCount": 5 }, ...],
--   "colStartLabel": "East", "colEndLabel": "West" }
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS layout_meta JSONB;

-- ── Room tables: what sits on each grid cell when plants aren't placed 1:1 ──
CREATE TABLE IF NOT EXISTS room_tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    position_row INTEGER NOT NULL CHECK (position_row >= 0),
    position_col INTEGER NOT NULL CHECK (position_col >= 0),
    section VARCHAR(80),
    -- [{ "strain": "GSB4", "count": 7 }, { "strain": "ARS20", "count": 7 }]
    strains JSONB NOT NULL DEFAULT '[]',
    plant_count INTEGER NOT NULL DEFAULT 0 CHECK (plant_count >= 0),
    source VARCHAR(20) NOT NULL DEFAULT 'sheet' CHECK (source IN ('sheet', 'app', 'ai')),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE (room_id, position_row, position_col)
);

CREATE INDEX IF NOT EXISTS idx_room_tables_company_room ON room_tables (company_id, room_id);

-- ── Health events: the operator's score and where the record came from ──────
ALTER TABLE plant_health_events
    ADD COLUMN IF NOT EXISTS rot_score NUMERIC(3, 1) CHECK (rot_score IS NULL OR (rot_score >= 0 AND rot_score <= 3)),
    ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'app' CHECK (source IN ('app', 'ai', 'sheet'));

-- Re-importing a sheet for the same room and day replaces that day's sheet events.
CREATE INDEX IF NOT EXISTS idx_phe_room_sheet_day ON plant_health_events (room_id, source, (observed_at::date));
