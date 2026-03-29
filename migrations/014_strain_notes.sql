-- Migration 014: Add notes field to strains
ALTER TABLE strains ADD COLUMN IF NOT EXISTS notes TEXT;
