-- 035b: Seed realistic supply items for each pool

-- ── Extraction Supplies ──────────────────────────────────────────────────
INSERT INTO supply_items (company_id, pool_id, name, category, unit, quantity_on_hand, par_level, reorder_qty, vendor_name, unit_cost)
SELECT c.id, sp.id, v.name, v.category, v.unit, v.qty, v.par, v.reorder, v.vendor, v.cost
FROM companies c
JOIN supply_pools sp ON sp.company_id = c.id AND sp.slug = 'extraction'
CROSS JOIN (VALUES
    ('0.5g Cartridges',       'carts',     'ea',  1200, 500,  2000, 'CCELL',           1.25),
    ('1.0g Cartridges',       'carts',     'ea',   400, 200,   500, 'CCELL',           1.50),
    ('Cart Boxes (100ct)',    'carts',     'box',    8,   3,     5, 'CCELL',          18.00),
    ('25μ Wash Bags',         'bags',      'ea',     6,   2,     4, 'BubbleBagDude',  35.00),
    ('73μ Wash Bags',         'bags',      'ea',     6,   2,     4, 'BubbleBagDude',  35.00),
    ('160μ Wash Bags',        'bags',      'ea',     6,   2,     4, 'BubbleBagDude',  35.00),
    ('Parchment Paper Rolls', 'parchment', 'roll',   4,   2,     4, 'Reynolds',        8.50),
    ('BHO Filters (10pk)',    'filters',   'box',    3,   2,     5, 'BVV',            42.00),
    ('Rosin Bags 2x4 90μ',   'bags',      'box',    5,   2,     5, 'Press Club',     28.00),
    ('Rosin Bags 2x4 120μ',  'bags',      'box',    4,   2,     5, 'Press Club',     28.00),
    ('Terp Jars 5mL',        'tubes',     'ea',   300, 100,   500, NULL,              0.45),
    ('Dab Tool Caps',         'tubes',     'ea',   300, 100,   500, NULL,              0.15)
) AS v(name, category, unit, qty, par, reorder, vendor, cost)
ON CONFLICT DO NOTHING;

-- ── Cultivation Inputs ───────────────────────────────────────────────────
INSERT INTO supply_items (company_id, pool_id, name, category, unit, quantity_on_hand, par_level, reorder_qty, vendor_name, unit_cost)
SELECT c.id, sp.id, v.name, v.category, v.unit, v.qty, v.par, v.reorder, v.vendor, v.cost
FROM companies c
JOIN supply_pools sp ON sp.company_id = c.id AND sp.slug = 'cultivation'
CROSS JOIN (VALUES
    ('Athena Core',           'nutrients', 'gal',   6,   3,     6, 'Athena',         48.00),
    ('Athena Bloom',          'nutrients', 'gal',   4,   3,     6, 'Athena',         52.00),
    ('Athena Fade',           'nutrients', 'gal',   3,   2,     4, 'Athena',         38.00),
    ('Athena CaMg',           'nutrients', 'gal',   3,   2,     4, 'Athena',         32.00),
    ('Lost Coast Plant Therapy', 'ipm',   'gal',   2,   1,     2, 'Lost Coast',     45.00),
    ('Regalia Biofungicide',  'ipm',       'L',     3,   1,     2, 'Marrone Bio',    65.00),
    ('Beneficial Insects (sachets)', 'beneficial_insects', 'ea', 50, 20, 50, 'Koppert', 3.50),
    ('Rockwool Cubes 1.5"',  'grow_media','bag',    8,   3,     6, 'Grodan',        12.00),
    ('Coco Coir Blocks',     'grow_media','ea',    12,   5,    10, 'Char Coir',      8.00),
    ('pH Down',               'nutrients', 'gal',   2,   1,     2, 'General Hydro',  18.00),
    ('Trellis Netting 5x30', 'other',     'roll',   4,   2,     4, NULL,             14.00)
) AS v(name, category, unit, qty, par, reorder, vendor, cost)
ON CONFLICT DO NOTHING;

-- ── Facility / General ───────────────────────────────────────────────────
INSERT INTO supply_items (company_id, pool_id, name, category, unit, quantity_on_hand, par_level, reorder_qty, vendor_name, unit_cost)
SELECT c.id, sp.id, v.name, v.category, v.unit, v.qty, v.par, v.reorder, v.vendor, v.cost
FROM companies c
JOIN supply_pools sp ON sp.company_id = c.id AND sp.slug = 'facility'
CROSS JOIN (VALUES
    ('Nitrile Gloves L (100ct)',  'gloves',   'box',  6,   3,     8, 'Uline',          12.00),
    ('Nitrile Gloves M (100ct)', 'gloves',   'box',  4,   3,     8, 'Uline',          12.00),
    ('Nitrile Gloves XL (100ct)','gloves',   'box',  3,   2,     6, 'Uline',          12.00),
    ('Isopropyl Alcohol 99%',    'cleaning', 'gal',  4,   2,     4, 'Uline',           9.50),
    ('Turkey Bags (100ct)',      'bags',     'box',  5,   2,     4, NULL,             22.00),
    ('Boveda 62% (10pk)',        'bags',     'box',  8,   3,     6, 'Boveda',         18.00),
    ('Label Rolls (1000ct)',     'labels',   'roll', 3,   2,     4, 'DYMO',           24.00),
    ('Hair Nets (100ct)',        'ppe',      'box',  4,   2,     4, 'Uline',           8.00),
    ('Beard Nets (100ct)',       'ppe',      'box',  2,   1,     3, 'Uline',           8.00),
    ('Tyvek Suits',              'ppe',      'ea',  10,   5,    10, 'Uline',           4.50),
    ('Trash Bags 55gal (50ct)',  'cleaning', 'box',  3,   2,     4, 'Uline',          28.00),
    ('Spray Bottles 32oz',       'cleaning', 'ea',   6,   3,     6, NULL,              3.50)
) AS v(name, category, unit, qty, par, reorder, vendor, cost)
ON CONFLICT DO NOTHING;
