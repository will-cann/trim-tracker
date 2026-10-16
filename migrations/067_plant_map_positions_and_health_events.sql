-- ============================================================================
-- Migration 067: Plant mapping — in-room positions, health event log,
--                feed profiles
-- ============================================================================
-- Goals this unlocks:
--   * Map exactly where bud rot (and other issues) show up inside a room,
--     not just which room — every observation carries a grid position.
--   * Hot-spot history survives harvests and moves: events snapshot the
--     room + cell at observation time, so a recurring wet corner shows up
--     across cycles even though the plants that sat there are long gone.
--   * Proactive movement planning: the planner needs empty-cell inventory
--     per room (layout dims + occupied cells) and a susceptibility signal
--     per plant (strain flower length / stretch / feed).
--   * Sorting plants by feed, flower length and stretch: feed is new;
--     flower length (default_flowering_days) and stretch (stretch_trait)
--     already live on strains.
--
-- Run: node scripts/run-migration.mjs migrations/067_plant_map_positions_and_health_events.sql
-- ============================================================================

-- ── Rooms: optional bench/row grid ──────────────────────────────────────────
-- A room without a layout still works everywhere; the map view just asks
-- for one before plants can be placed.
ALTER TABLE rooms
    ADD COLUMN IF NOT EXISTS layout_rows INTEGER
        CHECK (layout_rows IS NULL OR (layout_rows >= 1 AND layout_rows <= 60)),
    ADD COLUMN IF NOT EXISTS layout_cols INTEGER
        CHECK (layout_cols IS NULL OR (layout_cols >= 1 AND layout_cols <= 60));

-- ── Plants: position inside the current room's grid (0-indexed) ─────────────
ALTER TABLE plants
    ADD COLUMN IF NOT EXISTS position_row INTEGER CHECK (position_row IS NULL OR position_row >= 0),
    ADD COLUMN IF NOT EXISTS position_col INTEGER CHECK (position_col IS NULL OR position_col >= 0);

-- One live plant per cell. Harvested/destroyed plants keep their last
-- position for the record but no longer reserve the cell.
CREATE UNIQUE INDEX IF NOT EXISTS idx_plants_room_cell_live
    ON plants (room_id, position_row, position_col)
    WHERE position_row IS NOT NULL
      AND position_col IS NOT NULL
      AND growth_phase IN ('vegetative', 'flowering');

-- ── Strains: feed profile (free text, grouped by exact value) ───────────────
-- e.g. "Light", "Medium", "Heavy", "Athena 2.5EC", "Jacks 3-2-1".
ALTER TABLE strains
    ADD COLUMN IF NOT EXISTS feed_profile VARCHAR(60);

-- ── Plant health events: the observation log ────────────────────────────────
-- plants.contaminants / plant_health stay as the *current* state (what the
-- room cards and the AI's find_plants read). This table is the history
-- that the hot-spot map and the move planner are built on.
CREATE TABLE IF NOT EXISTS plant_health_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

    -- Subject. plant_id is nullable so the record survives plant deletion.
    plant_id UUID REFERENCES plants(id) ON DELETE SET NULL,
    plant_label VARCHAR(255),
    strain_name VARCHAR(255),

    -- Where it was seen (snapshot — plants move, hot spots don't).
    room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
    room_name VARCHAR(255),
    position_row INTEGER,
    position_col INTEGER,

    -- What was seen.
    contaminant VARCHAR(60) NOT NULL,              -- snake_case key, e.g. 'botrytis'
    severity SMALLINT NOT NULL DEFAULT 3 CHECK (severity BETWEEN 1 AND 5),
    note TEXT,

    -- When in the plant's life it was seen (bud rot is a late-flower problem).
    growth_phase VARCHAR(20),
    flowering_day INTEGER,                         -- days since flowering_date, if flowering

    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved')),
    observed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE,
    reported_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_phe_company_observed ON plant_health_events (company_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_phe_company_room ON plant_health_events (company_id, room_id);
CREATE INDEX IF NOT EXISTS idx_phe_plant ON plant_health_events (plant_id) WHERE plant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_phe_company_contaminant_status ON plant_health_events (company_id, contaminant, status);

-- ── Seed: demo facility (Green Valley Cultivation) ──────────────────────────
-- Gives the flower rooms a grid, places the seeded flowering plants, sets a
-- feed profile per strain, and backfills one event per existing contaminant
-- so the hot-spot map isn't empty on first open. Every statement is scoped
-- to the demo company and is a no-op elsewhere.
DO $$
DECLARE
    v_company UUID := '11111111-1111-1111-1111-111111111111';
    v_room RECORD;
    v_plant RECORD;
    v_idx INTEGER;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM companies WHERE id = v_company) THEN
        RETURN;
    END IF;

    UPDATE rooms SET layout_rows = 4, layout_cols = 8
    WHERE company_id = v_company AND room_type = 'flower' AND layout_rows IS NULL;
    UPDATE rooms SET layout_rows = 3, layout_cols = 6
    WHERE company_id = v_company AND room_type = 'veg' AND layout_rows IS NULL;

    UPDATE strains SET feed_profile = CASE LOWER(name)
        WHEN 'blue dream' THEN 'Heavy'
        WHEN 'og kush' THEN 'Medium'
        WHEN 'gelato' THEN 'Medium'
        WHEN 'wedding cake' THEN 'Heavy'
        WHEN 'purple punch' THEN 'Light'
        WHEN 'zkittlez' THEN 'Light'
        ELSE feed_profile END
    WHERE company_id = v_company AND feed_profile IS NULL;

    -- Place live plants row-major in each room that has a layout.
    FOR v_room IN
        SELECT id, layout_rows, layout_cols FROM rooms
        WHERE company_id = v_company AND layout_rows IS NOT NULL AND layout_cols IS NOT NULL
    LOOP
        v_idx := 0;
        FOR v_plant IN
            SELECT id FROM plants
            WHERE company_id = v_company AND room_id = v_room.id
              AND growth_phase IN ('vegetative', 'flowering')
              AND position_row IS NULL
            ORDER BY strain_name, label
        LOOP
            EXIT WHEN v_idx >= v_room.layout_rows * v_room.layout_cols;
            UPDATE plants
            SET position_row = v_idx / v_room.layout_cols,
                position_col = v_idx % v_room.layout_cols
            WHERE id = v_plant.id;
            v_idx := v_idx + 1;
        END LOOP;
    END LOOP;

    -- Backfill one active event per (plant, contaminant) currently flagged.
    INSERT INTO plant_health_events (
        company_id, plant_id, plant_label, strain_name, room_id, room_name,
        position_row, position_col, contaminant, severity, growth_phase, flowering_day, observed_at
    )
    SELECT
        p.company_id, p.id, p.label, p.strain_name, p.room_id, r.name,
        p.position_row, p.position_col, c.key,
        CASE c.key WHEN 'botrytis' THEN 4 WHEN 'powdery_mildew' THEN 3 ELSE 2 END,
        p.growth_phase,
        CASE WHEN p.flowering_date IS NOT NULL THEN (CURRENT_DATE - p.flowering_date) ELSE NULL END,
        NOW() - INTERVAL '3 days'
    FROM plants p
    LEFT JOIN rooms r ON r.id = p.room_id
    CROSS JOIN LATERAL unnest(p.contaminants) AS c(key)
    WHERE p.company_id = v_company
      AND p.growth_phase IN ('vegetative', 'flowering')
      AND NOT EXISTS (
          SELECT 1 FROM plant_health_events e
          WHERE e.plant_id = p.id AND e.contaminant = c.key
      );
END $$;
