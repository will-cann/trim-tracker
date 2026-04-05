-- Add stretch trait to strains for canopy planning
ALTER TABLE strains
  ADD COLUMN stretch_trait VARCHAR(10) DEFAULT NULL
  CHECK (stretch_trait IN ('low', 'medium', 'high'));
