-- 049: Expand product type catalog with BHO, solventless, and distillate variants
-- The original seed (046) covered core types but missed the specific product
-- forms that each extraction pathway produces.

INSERT INTO product_types (company_id, name, display_name, category, default_unit, is_cannabis, sort_order)
SELECT c.id, t.name, t.display_name, t.category, t.default_unit, t.is_cannabis, t.sort_order
FROM companies c
CROSS JOIN (VALUES
    -- BHO intermediates
    ('shatter',              'Shatter',                 'intermediate', 'g',    true,  141),
    ('wax',                  'Wax / Budder',            'intermediate', 'g',    true,  142),
    ('crumble',              'Crumble',                 'intermediate', 'g',    true,  143),
    ('live_resin_diamonds',  'Live Resin Diamonds',     'intermediate', 'g',    true,  144),
    ('live_resin_sugar',     'Live Resin Sugar',        'intermediate', 'g',    true,  145),
    ('live_resin_sauce',     'Live Resin Sauce',        'intermediate', 'g',    true,  146),
    ('live_resin_badder',    'Live Resin Badder',       'intermediate', 'g',    true,  147),

    -- Solventless extras
    ('live_rosin_badder',    'Live Rosin Badder',       'intermediate', 'g',    true,  121),
    ('dry_sift',             'Dry Sift',                'intermediate', 'g',    true,  122),
    ('temple_balls',         'Temple Balls',            'intermediate', 'g',    true,  123),

    -- BHO crude / intermediate stages
    ('crude_extract',        'Crude Extract',           'intermediate', 'g',    true,  148),

    -- Isolate (distillate pathway)
    ('isolate',              'Isolate',                 'intermediate', 'g',    true,  131),

    -- Additional finished goods
    ('live_resin_pen',       'Live Resin Pen',          'finished',     'each', true,  231),
    ('edible',               'Edible',                  'finished',     'each', true,  240),
    ('topical',              'Topical',                 'finished',     'each', true,  250),
    ('tincture',             'Tincture',                'finished',     'each', true,  260),
    ('preroll',              'Pre-Roll',                'finished',     'each', true,  270),
    ('preroll_infused',      'Infused Pre-Roll',        'finished',     'each', true,  271)
) AS t(name, display_name, category, default_unit, is_cannabis, sort_order)
ON CONFLICT (company_id, name) DO NOTHING;
