-- 035: Consumable supply inventory — par-level tracking with ledger
-- Non-cannabis supplies consumed during SOPs (carts, filters, gloves, nutrients, etc.)

-- ── Supply Pools (one row per pool per company) ──────────────────────────
CREATE TABLE IF NOT EXISTS supply_pools (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    slug            TEXT NOT NULL CHECK (slug IN ('extraction', 'cultivation', 'facility')),
    label           TEXT NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_supply_pools_company ON supply_pools(company_id);

-- ── Supply Items (par-level inventory) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS supply_items (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    pool_id             UUID NOT NULL REFERENCES supply_pools(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    description         TEXT,
    category            TEXT,
    unit                TEXT NOT NULL DEFAULT 'ea',
    quantity_on_hand    NUMERIC(12,2) NOT NULL DEFAULT 0,
    par_level           NUMERIC(12,2),
    reorder_qty         NUMERIC(12,2),
    vendor_name         TEXT,
    sku                 TEXT,
    unit_cost           NUMERIC(10,2),
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_supply_items_company ON supply_items(company_id);
CREATE INDEX IF NOT EXISTS idx_supply_items_pool ON supply_items(pool_id);
CREATE INDEX IF NOT EXISTS idx_supply_items_category ON supply_items(company_id, category);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_supply_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_supply_items_updated_at
    BEFORE UPDATE ON supply_items
    FOR EACH ROW
    EXECUTE FUNCTION update_supply_items_updated_at();

-- ── Supply Ledger (immutable audit log) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS supply_ledger (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    supply_item_id      UUID NOT NULL REFERENCES supply_items(id) ON DELETE CASCADE,
    change_type         TEXT NOT NULL CHECK (change_type IN ('receive', 'consume', 'adjust', 'waste')),
    quantity_delta      NUMERIC(12,2) NOT NULL,
    quantity_after      NUMERIC(12,2) NOT NULL,
    reference_type      TEXT,
    reference_id        UUID,
    notes               TEXT,
    performed_by        UUID REFERENCES users(id),
    created_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_supply_ledger_item ON supply_ledger(supply_item_id);
CREATE INDEX IF NOT EXISTS idx_supply_ledger_company ON supply_ledger(company_id);
CREATE INDEX IF NOT EXISTS idx_supply_ledger_created ON supply_ledger(company_id, created_at);

-- ── Step-Supply Requirements (SOP linkage, Phase 3) ─────────────────────
CREATE TABLE IF NOT EXISTS step_supply_requirements (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    step_id             UUID NOT NULL REFERENCES process_steps(id) ON DELETE CASCADE,
    supply_item_id      UUID NOT NULL REFERENCES supply_items(id) ON DELETE CASCADE,
    quantity_per        NUMERIC(12,2) NOT NULL DEFAULT 1,
    UNIQUE(step_id, supply_item_id)
);
CREATE INDEX IF NOT EXISTS idx_step_supply_step ON step_supply_requirements(step_id);

-- ── Auto-seed pools for existing companies ───────────────────────────────
INSERT INTO supply_pools (company_id, slug, label)
SELECT id, 'extraction', 'Extraction Supplies' FROM companies
ON CONFLICT DO NOTHING;

INSERT INTO supply_pools (company_id, slug, label)
SELECT id, 'cultivation', 'Cultivation Inputs' FROM companies
ON CONFLICT DO NOTHING;

INSERT INTO supply_pools (company_id, slug, label)
SELECT id, 'facility', 'Facility / General' FROM companies
ON CONFLICT DO NOTHING;
