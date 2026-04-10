-- 044: Store inventory snapshot — current on-hand per store/SKU from CSV imports
-- Used by order suggestions: order_qty = velocity * (lead_time + cadence) - on_hand

CREATE TABLE IF NOT EXISTS store_inventory (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id),
    store_id        UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    product_sku     TEXT NOT NULL,
    product_name    TEXT,
    on_hand         INT DEFAULT 0,
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(store_id, product_sku)
);
CREATE INDEX IF NOT EXISTS idx_store_inventory_company ON store_inventory(company_id);
CREATE INDEX IF NOT EXISTS idx_store_inventory_store ON store_inventory(store_id);

-- Track imported sales batches so we can show import history & undo
CREATE TABLE IF NOT EXISTS sales_imports (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id),
    store_id        UUID REFERENCES stores(id),
    file_name       TEXT,
    rows_imported   INT DEFAULT 0,
    date_min        DATE,
    date_max        DATE,
    imported_at     TIMESTAMPTZ DEFAULT NOW(),
    imported_by     UUID REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_sales_imports_company ON sales_imports(company_id);
