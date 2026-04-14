-- Strain variety attributes for the demand planner
-- Created: 2026-04-14
--
-- Adds the four axes the variety planner needs to pick strains and
-- balance a mixed production target (e.g., "5000 live rosin carts across
-- 4 strains — 1 sativa, 1 indica, 2 hybrids"):
--
--   phenotype          sativa | indica | hybrid (categorical bucket)
--   terpene_tags       up to 3 from a fixed 9-bucket taxonomy (categorical bucket)
--   expected_yield_pct output-to-input conversion guess (quantitative filter / weight)
--   avg_cost_per_g     blended cost input to the planner (quantitative filter / weight)
--
-- All four are nullable — existing strains keep working with no data,
-- the planner degrades gracefully (unknown bucket) when fields are empty.
-- Track B (global strain catalog) will later populate these from
-- community-aggregated data at create time; Track A (this migration)
-- just makes the columns exist so operators can enter values manually
-- and the planner can consume them.

ALTER TABLE strains
    ADD COLUMN IF NOT EXISTS phenotype text
        CHECK (phenotype IN ('sativa', 'indica', 'hybrid')),
    ADD COLUMN IF NOT EXISTS terpene_tags text[],
    ADD COLUMN IF NOT EXISTS expected_yield_pct numeric(5, 2)
        CHECK (expected_yield_pct IS NULL OR (expected_yield_pct >= 0 AND expected_yield_pct <= 100)),
    ADD COLUMN IF NOT EXISTS avg_cost_per_g numeric(10, 4)
        CHECK (avg_cost_per_g IS NULL OR avg_cost_per_g >= 0);

-- Soft-validate the terpene tag taxonomy at the app layer rather than
-- via a CHECK constraint — the 9 buckets are likely to grow and a text[]
-- + validator in the endpoint keeps schema changes out of the way.
