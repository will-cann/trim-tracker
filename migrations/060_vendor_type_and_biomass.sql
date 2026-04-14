-- 060: Vendor type extension — biomass suppliers + lightweight CRM fields
--
-- Part of P4 (demand planning + CRM). Existing vendors all default to
-- 'consumables' so nothing in the ordering module breaks. Biomass vendors
-- (licensed cultivators selling flower/trim/fresh frozen) get a separate
-- type plus a few extra fields for supplier CRM: strains they grow, last
-- contact timestamp, quality notes, preferred unit of measure, license
-- number, and preferred outreach channel.

ALTER TABLE vendors
    ADD COLUMN IF NOT EXISTS vendor_type        TEXT        NOT NULL DEFAULT 'consumables'
        CHECK (vendor_type IN ('consumables','biomass','both')),
    ADD COLUMN IF NOT EXISTS strains_grown      TEXT[],
    ADD COLUMN IF NOT EXISTS last_contacted_at  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS quality_notes      TEXT,
    ADD COLUMN IF NOT EXISTS preferred_units    TEXT,
    ADD COLUMN IF NOT EXISTS license_number     TEXT,
    ADD COLUMN IF NOT EXISTS preferred_channel  TEXT        NOT NULL DEFAULT 'email'
        CHECK (preferred_channel IN ('email','sms'));

CREATE INDEX IF NOT EXISTS idx_vendors_vendor_type ON vendors(company_id, vendor_type);
