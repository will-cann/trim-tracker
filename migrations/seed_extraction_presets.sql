-- ============================================================================
-- Seed: Preset extraction process templates
-- Run per-company — uses company_id from the target company
-- These get inserted by the app on first access if no templates exist
-- ============================================================================

-- This file documents the preset templates. They are inserted programmatically
-- by the get-process-templates endpoint when a company has no templates yet.

-- ── Solventless: Fresh Frozen → Rosin ──────────────────────────────────────
--
-- 1. Wash         | fresh_frozen → bubble_hash  | wash_vessel      | ~5% yield  | 2h
-- 2. Freeze Dry   | bubble_hash → bubble_hash   | freeze_dryer     | ~96%       | 24h
-- 3. Press        | bubble_hash → rosin          | rosin_press      | ~60%       | 1h
-- 4. Decarb       | rosin → rosin                | vacuum_oven      | ~95%       | 2h   (optional)
-- 5. Fill Carts   | rosin → rosin_cart            | cart_filler       | ~95%       | 2h   (optional)
-- 6. Package      | rosin_cart → rosin_cart        | (manual)          | ~100%      | 1h   (optional)

-- ── BHO: Fresh Frozen → Concentrate ───────────────────────────────────────
--
-- 1. Extract      | fresh_frozen → crude_extract  | closed_loop_extractor | ~15%  | 4h
-- 2. Purge/Dewax  | crude_extract → purged_extract | vacuum_oven          | ~90%  | 24h
-- 3. Pour/Cure    | purged_extract → bho_concentrate | (manual)           | ~95%  | 48h  (optional — for diamonds/sauce)
-- 4. Package      | bho_concentrate → bho_concentrate | (manual)          | ~100% | 1h

-- ── Distillate: Trim/Biomass → Distillate ─────────────────────────────────
--
-- 1. Extract      | trim → crude_extract           | closed_loop_extractor | ~12% | 4h
-- 2. Winterize    | crude_extract → winterized      | (manual)              | ~85% | 12h
-- 3. Filter       | winterized → filtered           | filter_press          | ~95% | 2h
-- 4. Distill      | filtered → distillate           | short_path            | ~80% | 6h
-- 5. Package      | distillate → distillate         | (manual)              | ~100% | 1h
