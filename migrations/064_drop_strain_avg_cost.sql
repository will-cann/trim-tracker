-- Revert: drop strains.avg_cost_per_g
-- Created: 2026-04-14
--
-- Cost was added to `strains` in migration 063 as a shortcut for the
-- variety planner's cost filter. It doesn't hold up in practice — the
-- same strain has 3-5 different prices depending on product form (fresh
-- frozen vs dry flower vs trim vs shake), supplier, and market week.
-- Real pricing lives in `vendor_products` (migration 034), keyed to
-- vendor + SKU, and should be aggregated at query time by strain +
-- input type for the planner. See upcoming `get-strain-pricing` endpoint.
--
-- Dropping the column now (before any app data relies on it) rather
-- than letting it calcify as a stale duplicate.

ALTER TABLE strains DROP COLUMN IF EXISTS avg_cost_per_g;
