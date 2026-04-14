-- Migration 062: Supplier outreach cadence reminders
-- Adds per-vendor reminder cadence + next_reminder_at tracking for the
-- cron-supplier-reminders scheduled function (Unit 9, P4 CRM slice).
--
-- Sibling to Unit 1's vendor_type + last_contacted_at migration. If Unit 1
-- hasn't landed yet, the cron simply no-ops (no biomass vendors match).

ALTER TABLE vendors
    ADD COLUMN IF NOT EXISTS outreach_cadence_days INTEGER,
    ADD COLUMN IF NOT EXISTS next_reminder_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_vendors_next_reminder_at
    ON vendors(next_reminder_at)
    WHERE outreach_cadence_days IS NOT NULL;
