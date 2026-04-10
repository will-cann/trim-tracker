-- 052: Add bho_concentrate as a product type
--
-- The original BHO — Hydrocarbon Extraction preset (from seedPresets() in
-- get-process-templates.ts, pre-catalog era) uses bho_concentrate as the
-- intermediate state after the Purge/Dewax step. It wasn't in the catalog,
-- so it rendered in raw snake_case in the SOP "Creates" chips.
--
-- Represents post-purge, pre-post-processing BHO material. Distinct from
-- crude_extract (pre-purge).

INSERT INTO product_types (company_id, name, display_name, category, default_unit, is_cannabis, process_types, sort_order)
SELECT c.id, 'bho_concentrate', 'BHO Concentrate', 'intermediate', 'g', true, ARRAY['bho']::text[], 149
FROM companies c
ON CONFLICT (company_id, name) DO UPDATE
SET display_name = EXCLUDED.display_name,
    category = EXCLUDED.category,
    default_unit = EXCLUDED.default_unit,
    process_types = EXCLUDED.process_types,
    sort_order = EXCLUDED.sort_order,
    updated_at = NOW();
