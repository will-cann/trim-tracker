-- Package Adjustments — audited quantity changes with METRC-aligned reason codes
-- Migration: 040_package_adjustments
-- Phase 2 of METRC integration: every quantity change is a tracked adjustment

CREATE TABLE package_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    package_id UUID NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES users(id),

    -- Adjustment details
    quantity_before DECIMAL(10,2) NOT NULL,
    quantity_after DECIMAL(10,2) NOT NULL,
    quantity_delta DECIMAL(10,2) NOT NULL,  -- positive = increase, negative = decrease

    -- METRC reason codes (matches /packages/v1/adjust ReasonName enum)
    reason VARCHAR(50) NOT NULL
        CHECK (reason IN ('Waste', 'Moisture Loss', 'Processing Loss', 'Theft', 'Reconciliation')),

    notes TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_pkg_adjustments_company ON package_adjustments(company_id);
CREATE INDEX idx_pkg_adjustments_package ON package_adjustments(package_id);
CREATE INDEX idx_pkg_adjustments_created ON package_adjustments(company_id, created_at DESC);
