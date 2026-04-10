-- 050: Tag product types with which extraction pathways they belong to
-- Enables filtering the SOP editor's Accepts/Produces pickers by process type.
-- A product can belong to multiple pathways (e.g. distillate from BHO or distillate path).
-- Biomass is pathway-agnostic (empty array = available to all).

ALTER TABLE product_types
    ADD COLUMN IF NOT EXISTS process_types TEXT[] DEFAULT '{}';

COMMENT ON COLUMN product_types.process_types IS 'Which extraction pathways produce/use this type (solventless, bho, distillate). Empty = available to all (biomass, additives).';

-- Seed pathway associations
-- Biomass + additives: empty (universal) — no update needed, default is '{}'

-- Solventless pathway
UPDATE product_types SET process_types = array_cat(process_types, '{solventless}')
WHERE name IN ('bubble_hash', 'rosin', 'live_rosin', 'live_rosin_badder', 'dry_sift', 'temple_balls',
               'rosin_cart', 'live_rosin_cart')
  AND NOT (process_types @> '{solventless}');

-- BHO pathway
UPDATE product_types SET process_types = array_cat(process_types, '{bho}')
WHERE name IN ('crude_extract', 'shatter', 'wax', 'crumble',
               'live_resin', 'live_resin_diamonds', 'live_resin_sugar', 'live_resin_sauce', 'live_resin_badder',
               'live_resin_cart', 'live_resin_pen')
  AND NOT (process_types @> '{bho}');

-- Distillate pathway
UPDATE product_types SET process_types = array_cat(process_types, '{distillate}')
WHERE name IN ('distillate', 'isolate', 'distillate_cart')
  AND NOT (process_types @> '{distillate}');

-- Custom / other pathway (cross-category products)
UPDATE product_types SET process_types = array_cat(process_types, '{custom}')
WHERE name IN ('edible', 'topical', 'tincture', 'preroll', 'preroll_infused')
  AND NOT (process_types @> '{custom}');
