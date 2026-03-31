-- Allow null input_quantity on extraction_logs for cases where
-- the user reports output without specifying how much input was consumed
-- Migration: 022_extraction_logs_nullable_input

ALTER TABLE extraction_logs ALTER COLUMN input_quantity DROP NOT NULL;
