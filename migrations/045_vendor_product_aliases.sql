-- 045: SKU aliases — many-to-one mapping from POS SKUs to canonical vendor_products
-- POS systems (Dutchie etc) use SKUs that don't match vendor catalogs. Aliases bridge them
-- so order suggestions can resolve sales velocity → vendor product.

CREATE TABLE IF NOT EXISTS vendor_product_aliases (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL REFERENCES companies(id),
    vendor_product_id   UUID NOT NULL REFERENCES vendor_products(id) ON DELETE CASCADE,
    sku                 TEXT NOT NULL,
    source              TEXT DEFAULT 'manual' CHECK (source IN ('manual','ai','import')),
    confidence          NUMERIC(3,2),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, sku)
);
CREATE INDEX IF NOT EXISTS idx_vp_aliases_company ON vendor_product_aliases(company_id);
CREATE INDEX IF NOT EXISTS idx_vp_aliases_product ON vendor_product_aliases(vendor_product_id);
CREATE INDEX IF NOT EXISTS idx_vp_aliases_sku_lower ON vendor_product_aliases(company_id, LOWER(sku));
