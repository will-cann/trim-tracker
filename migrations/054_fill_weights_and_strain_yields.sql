-- 054: Fill weights, output-scaling supplies, and per-strain yield overrides
--
-- Three related concerns bundled together because they all unblock a single
-- workflow: planning a run of carts with accurate biomass + hardware math,
-- and letting operators type in yields they know by heart.
--
-- 1. product_types.gram_weight — grams of input material per each-unit of
--    output. Lets the planner convert "1000 rosin carts" → "500 g rosin"
--    before walking the yield chain backward.
--
-- 2. step_supply_requirements.scales_with_output — when true, quantity_per
--    multiplies by the producing stage's output at plan/run time. Makes
--    "1 empty cart per filled cart" debit correctly whether the run is
--    for 50 or 5000 units.
--
-- 3. strain_yield_overrides — manual per-strain yield entries. Solventless
--    yields swing a lot by strain (GMO ~7% vs White Fire ~4.5% on the same
--    SOP), so operators need to encode that on day one without waiting for
--    extraction_logs to accumulate.

ALTER TABLE product_types
    ADD COLUMN IF NOT EXISTS gram_weight NUMERIC NULL;

COMMENT ON COLUMN product_types.gram_weight IS
    'For each-unit products (carts, pens, buckets), the grams of input material per unit. Null for bulk-weight products.';

ALTER TABLE step_supply_requirements
    ADD COLUMN IF NOT EXISTS scales_with_output BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN step_supply_requirements.scales_with_output IS
    'When true, quantity_per is multiplied by the producing stage''s output qty at plan/run time. Used for hardware consumables (cart bodies, mouthpieces) where one unit of supply is consumed per output.';

-- Reasonable default fill weights on existing each-unit cart/pen entries.
-- Users can edit these or duplicate rows to add other fill sizes (1g, etc).
UPDATE product_types
SET gram_weight = 0.5
WHERE default_unit = 'each'
  AND name IN ('rosin_cart', 'live_rosin_cart', 'distillate_cart', 'live_resin_cart', 'live_resin_pen', 'distillate_pen')
  AND gram_weight IS NULL;

CREATE TABLE IF NOT EXISTS strain_yield_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    strain TEXT NOT NULL,
    template_id UUID NOT NULL REFERENCES process_templates(id) ON DELETE CASCADE,
    input_type TEXT NOT NULL,
    output_type TEXT NOT NULL,
    yield_pct NUMERIC NOT NULL CHECK (yield_pct >= 0 AND yield_pct <= 100),
    notes TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, strain, template_id, input_type, output_type)
);

CREATE INDEX IF NOT EXISTS idx_strain_yield_overrides_lookup
    ON strain_yield_overrides(company_id, strain, input_type, output_type);
