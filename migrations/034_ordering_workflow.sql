-- 034: Ordering workflow — vendors, stores, menus, products, purchase orders

-- ── Vendors ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendors (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id),
    name            TEXT NOT NULL,
    contact_name    TEXT,
    contact_email   TEXT,
    contact_phone   TEXT,
    lead_time_days  INT DEFAULT 3,
    order_cadence_days INT DEFAULT 7,
    notes           TEXT,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_vendors_company ON vendors(company_id);

-- ── Stores ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stores (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id),
    name            TEXT NOT NULL,
    pos_store_id    TEXT,
    address         TEXT,
    vault_capacity_notes TEXT,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_stores_company ON stores(company_id);

-- ── Vendor Menus (uploaded files) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendor_menus (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id       UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    company_id      UUID NOT NULL REFERENCES companies(id),
    file_name       TEXT,
    file_url        TEXT,
    status          TEXT DEFAULT 'pending' CHECK (status IN ('pending','parsing','parsed','failed')),
    parsed_at       TIMESTAMPTZ,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_vendor_menus_vendor ON vendor_menus(vendor_id);

-- ── Vendor Products (normalized catalog) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendor_products (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id       UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    company_id      UUID NOT NULL REFERENCES companies(id),
    menu_id         UUID REFERENCES vendor_menus(id) ON DELETE SET NULL,
    name            TEXT NOT NULL,
    brand           TEXT,
    category        TEXT,
    sku             TEXT,
    unit_size       TEXT,
    case_size       INT,
    unit_price      NUMERIC(10,2),
    case_price      NUMERIC(10,2),
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_vendor_products_vendor ON vendor_products(vendor_id);
CREATE INDEX idx_vendor_products_company ON vendor_products(company_id);

-- ── Purchase Orders ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id),
    vendor_id       UUID NOT NULL REFERENCES vendors(id),
    status          TEXT DEFAULT 'draft' CHECK (status IN ('draft','submitted','confirmed','delivered','cancelled')),
    submitted_at    TIMESTAMPTZ,
    expected_delivery TIMESTAMPTZ,
    delivered_at    TIMESTAMPTZ,
    total_units     INT DEFAULT 0,
    total_cost      NUMERIC(12,2) DEFAULT 0,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_purchase_orders_company ON purchase_orders(company_id);
CREATE INDEX idx_purchase_orders_vendor ON purchase_orders(vendor_id);
CREATE INDEX idx_purchase_orders_status ON purchase_orders(status);

-- ── Purchase Order Lines (per-store, per-product) ───────────────────────────
CREATE TABLE IF NOT EXISTS purchase_order_lines (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id            UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    store_id            UUID NOT NULL REFERENCES stores(id),
    vendor_product_id   UUID NOT NULL REFERENCES vendor_products(id),
    auto_suggested_qty  INT DEFAULT 0,
    final_qty           INT DEFAULT 0,
    unit_price          NUMERIC(10,2),
    line_total          NUMERIC(12,2) GENERATED ALWAYS AS (final_qty * unit_price) STORED,
    notes               TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_po_lines_order ON purchase_order_lines(order_id);
CREATE INDEX idx_po_lines_store ON purchase_order_lines(store_id);

-- ── Sales Data (from POS sync) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sales_data (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id),
    store_id        UUID NOT NULL REFERENCES stores(id),
    product_sku     TEXT NOT NULL,
    sale_date       DATE NOT NULL,
    units_sold      INT DEFAULT 0,
    revenue         NUMERIC(12,2) DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_sales_data_store_sku ON sales_data(store_id, product_sku);
CREATE INDEX idx_sales_data_date ON sales_data(sale_date);

-- ── Velocity Cache ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS velocity_cache (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id),
    store_id        UUID NOT NULL REFERENCES stores(id),
    product_sku     TEXT NOT NULL,
    window_weeks    INT DEFAULT 8,
    velocity_per_day NUMERIC(10,4),
    trend           TEXT CHECK (trend IN ('accelerating','stable','declining')),
    calculated_at   TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(store_id, product_sku, window_weeks)
);
CREATE INDEX idx_velocity_store ON velocity_cache(store_id);
