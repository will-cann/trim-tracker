-- Add invite tracking columns to trimmer_profiles
ALTER TABLE trimmer_profiles
  ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invite_status VARCHAR(20) DEFAULT 'none'
    CHECK (invite_status IN ('none', 'pending', 'accepted'));
