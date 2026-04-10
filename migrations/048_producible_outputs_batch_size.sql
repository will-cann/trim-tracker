-- 048: Add producible_outputs and standard_batch_size_g to process_templates
-- SOPs declare what they can produce (not just accept), enabling demand-backward planning.
-- standard_batch_size_g supports Holland's 500g-increment batch sizing for testing minimums.

ALTER TABLE process_templates
    ADD COLUMN IF NOT EXISTS producible_outputs TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS standard_batch_size_g INTEGER;

COMMENT ON COLUMN process_templates.producible_outputs IS 'Product type names this SOP can produce (e.g. live_rosin, rosin_cart). References product_types.name.';
COMMENT ON COLUMN process_templates.standard_batch_size_g IS 'Minimum output batch size in grams worth testing. Lab testing has a fixed cost so runs below this threshold are not cost-effective. Typically 500g increments.';

-- Backfill producible_outputs from preset templates' final step output_type
UPDATE process_templates pt
SET producible_outputs = sub.outputs
FROM (
    SELECT ps.template_id, ARRAY_AGG(DISTINCT ps.output_type) AS outputs
    FROM process_steps ps
    WHERE ps.output_type IS NOT NULL
      AND ps.step_order = (
          SELECT MAX(ps2.step_order)
          FROM process_steps ps2
          WHERE ps2.template_id = ps.template_id
      )
    GROUP BY ps.template_id
) sub
WHERE pt.id = sub.template_id
  AND (pt.producible_outputs IS NULL OR pt.producible_outputs = '{}');
