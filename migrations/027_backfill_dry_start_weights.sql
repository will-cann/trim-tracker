-- Backfill trim_entries: recalculate start_weight from wet weight using harvest moisture_loss_pct
-- Only updates entries that were stored with wet weight (wet_weight IS NULL means it was never set,
-- so start_weight is already the raw input — likely wet). Entries linked to a harvest get recalculated.

-- Step 1: For entries linked to a harvest that don't have wet_weight set,
-- copy current start_weight into wet_weight (it IS the wet weight)
UPDATE trim_entries te
SET wet_weight = te.start_weight
FROM harvests h
WHERE te.harvest_id = h.id
  AND te.wet_weight IS NULL
  AND te.start_weight IS NOT NULL;

-- Step 2: Recalculate start_weight as estimated dry weight
UPDATE trim_entries te
SET start_weight = CASE
    WHEN h.dry_weight IS NOT NULL AND h.dry_weight > 0 THEN h.dry_weight
    ELSE ROUND(te.wet_weight * (1 - COALESCE(h.moisture_loss_pct, 75) / 100), 2)
END
FROM harvests h
WHERE te.harvest_id = h.id
  AND te.wet_weight IS NOT NULL
  AND te.wet_weight = te.start_weight;
