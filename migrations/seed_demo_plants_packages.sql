-- =============================================================================
-- DEMO SEED DATA: More plants & packages for neurocann demo
-- Run: node scripts/run-migration.mjs migrations/seed_demo_plants_packages.sql
-- =============================================================================
-- Uses Green Valley Cultivation (company_id: 11111111-..., user: aaaaaaaa-...)
-- License: looked up dynamically via subquery

-- Helper variables
-- company_id = '11111111-1111-1111-1111-111111111111'
-- created_by = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

-- ─── ENSURE STRAINS EXIST ────────────────────────────────────────────────────
INSERT INTO strains (company_id, name) VALUES
    ('11111111-1111-1111-1111-111111111111', 'Wi Fi OG'),
    ('11111111-1111-1111-1111-111111111111', 'Gelato'),
    ('11111111-1111-1111-1111-111111111111', 'Ice Cream Cake'),
    ('11111111-1111-1111-1111-111111111111', 'GMO Cookies'),
    ('11111111-1111-1111-1111-111111111111', 'Runtz'),
    ('11111111-1111-1111-1111-111111111111', 'Gorilla Glue #4'),
    ('11111111-1111-1111-1111-111111111111', 'Wedding Cake'),
    ('11111111-1111-1111-1111-111111111111', 'Sunset Sherbert'),
    ('11111111-1111-1111-1111-111111111111', 'MAC 1')
ON CONFLICT (company_id, LOWER(name)) DO NOTHING;

-- ─── ENSURE ROOMS EXIST ──────────────────────────────────────────────────────
INSERT INTO rooms (company_id, name, room_type) VALUES
    ('11111111-1111-1111-1111-111111111111', 'Nursery B', 'nursery'),
    ('11111111-1111-1111-1111-111111111111', 'Veg Room 3', 'veg'),
    ('11111111-1111-1111-1111-111111111111', 'Flower Room 4', 'flower'),
    ('11111111-1111-1111-1111-111111111111', 'Dry Room 1', 'dry')
ON CONFLICT DO NOTHING;

-- ─── NURSERY: PLANT BATCHES (clones/seeds) ───────────────────────────────────
INSERT INTO plant_batches (company_id, name, batch_type, strain_name, room_id, untracked_count, planted_date, plant_health, contaminants)
SELECT
    '11111111-1111-1111-1111-111111111111',
    batch.name,
    batch.batch_type,
    batch.strain_name,
    r.id,
    batch.count,
    batch.planted_date::date,
    batch.health,
    batch.contaminants::text[]
FROM (VALUES
    ('Wi Fi OG Clones R2', 'clone', 'Wi Fi OG', 'Nursery A', 48, '2026-03-15', 100, '{}'),
    ('Gelato Clones', 'clone', 'Gelato', 'Nursery A', 36, '2026-03-18', 95, '{}'),
    ('GMO Cookies Seeds', 'seed', 'GMO Cookies', 'Nursery B', 24, '2026-03-20', 100, '{}'),
    ('Runtz Clones', 'clone', 'Runtz', 'Nursery B', 60, '2026-03-22', 90, '{powdery_mildew}'),
    ('MAC 1 Tissue', 'tissue_culture', 'MAC 1', 'Nursery A', 12, '2026-03-10', 100, '{}'),
    ('Ice Cream Cake Clones', 'clone', 'Ice Cream Cake', 'Nursery B', 30, '2026-03-25', 100, '{}')
) AS batch(name, batch_type, strain_name, room_name, count, planted_date, health, contaminants)
JOIN rooms r ON r.name = batch.room_name AND r.company_id = '11111111-1111-1111-1111-111111111111';

-- ─── VEGETATIVE PLANTS ───────────────────────────────────────────────────────
-- Wi Fi OG in Veg Room 1 (20 plants)
INSERT INTO plants (company_id, label, strain_name, room_id, growth_phase, planted_date, vegetative_date, plant_health, contaminants)
SELECT
    '11111111-1111-1111-1111-111111111111',
    'WFOG-V-' || LPAD(n::text, 3, '0'),
    'Wi Fi OG',
    r.id,
    'vegetative',
    '2026-02-20'::date,
    '2026-03-06'::date,
    CASE WHEN n <= 18 THEN 100 ELSE 85 END,
    CASE WHEN n <= 18 THEN '{}'::text[] ELSE '{nutrient_deficiency}'::text[] END
FROM generate_series(1, 20) AS n
CROSS JOIN rooms r
WHERE r.name = 'Veg Room 1' AND r.company_id = '11111111-1111-1111-1111-111111111111';

-- Gelato in Veg Room 2 (15 plants)
INSERT INTO plants (company_id, label, strain_name, room_id, growth_phase, planted_date, vegetative_date, plant_health, contaminants)
SELECT
    '11111111-1111-1111-1111-111111111111',
    'GEL-V-' || LPAD(n::text, 3, '0'),
    'Gelato',
    r.id,
    'vegetative',
    '2026-02-25'::date,
    '2026-03-11'::date,
    100,
    '{}'::text[]
FROM generate_series(1, 15) AS n
CROSS JOIN rooms r
WHERE r.name = 'Veg Room 2' AND r.company_id = '11111111-1111-1111-1111-111111111111';

-- GMO Cookies in Veg Room 3 (12 plants)
INSERT INTO plants (company_id, label, strain_name, room_id, growth_phase, planted_date, vegetative_date, plant_health, contaminants)
SELECT
    '11111111-1111-1111-1111-111111111111',
    'GMO-V-' || LPAD(n::text, 3, '0'),
    'GMO Cookies',
    r.id,
    'vegetative',
    '2026-03-01'::date,
    '2026-03-15'::date,
    CASE WHEN n <= 10 THEN 100 ELSE 70 END,
    CASE WHEN n <= 10 THEN '{}'::text[] ELSE '{spider_mites}'::text[] END
FROM generate_series(1, 12) AS n
CROSS JOIN rooms r
WHERE r.name = 'Veg Room 3' AND r.company_id = '11111111-1111-1111-1111-111111111111';

-- ─── FLOWERING PLANTS ────────────────────────────────────────────────────────
-- Wedding Cake in Flower Room 2 (18 plants, week 5)
INSERT INTO plants (company_id, label, strain_name, room_id, growth_phase, planted_date, vegetative_date, flowering_date, target_harvest_date, plant_health, contaminants)
SELECT
    '11111111-1111-1111-1111-111111111111',
    'WC-F-' || LPAD(n::text, 3, '0'),
    'Wedding Cake',
    r.id,
    'flowering',
    '2026-01-15'::date,
    '2026-02-01'::date,
    '2026-02-25'::date,
    '2026-04-25'::date,
    CASE WHEN n <= 16 THEN 95 ELSE 75 END,
    CASE WHEN n <= 16 THEN '{}'::text[] ELSE '{botrytis}'::text[] END
FROM generate_series(1, 18) AS n
CROSS JOIN rooms r
WHERE r.name = 'Flower Room 2' AND r.company_id = '11111111-1111-1111-1111-111111111111';

-- Sunset Sherbert in Flower Room 3 (15 plants, week 3)
INSERT INTO plants (company_id, label, strain_name, room_id, growth_phase, planted_date, vegetative_date, flowering_date, target_harvest_date, plant_health, contaminants)
SELECT
    '11111111-1111-1111-1111-111111111111',
    'SS-F-' || LPAD(n::text, 3, '0'),
    'Sunset Sherbert',
    r.id,
    'flowering',
    '2026-01-25'::date,
    '2026-02-10'::date,
    '2026-03-10'::date,
    '2026-05-05'::date,
    100,
    '{}'::text[]
FROM generate_series(1, 15) AS n
CROSS JOIN rooms r
WHERE r.name = 'Flower Room 3' AND r.company_id = '11111111-1111-1111-1111-111111111111';

-- Runtz in Flower Room 4 (22 plants, week 7 — near harvest)
INSERT INTO plants (company_id, label, strain_name, room_id, growth_phase, planted_date, vegetative_date, flowering_date, target_harvest_date, plant_health, contaminants)
SELECT
    '11111111-1111-1111-1111-111111111111',
    'RZ-F-' || LPAD(n::text, 3, '0'),
    'Runtz',
    r.id,
    'flowering',
    '2026-01-05'::date,
    '2026-01-20'::date,
    '2026-02-10'::date,
    '2026-04-10'::date,
    CASE WHEN n <= 20 THEN 100 ELSE 90 END,
    '{}'::text[]
FROM generate_series(1, 22) AS n
CROSS JOIN rooms r
WHERE r.name = 'Flower Room 4' AND r.company_id = '11111111-1111-1111-1111-111111111111';

-- ─── PACKAGES: FLOWER ────────────────────────────────────────────────────────
INSERT INTO packages (company_id, created_by, label, package_type, strain, license_number, quantity, status, lab_testing_state, packaged_date, location) VALUES
    ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'WC-FLR-2026-03-15', 'flower', 'Wedding Cake', 'LIC-123456', 450, 'active', 'passed', '2026-03-15', 'Vault A'),
    ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'WC-FLR-2026-03-15-B', 'flower', 'Wedding Cake', 'LIC-123456', 380, 'active', 'passed', '2026-03-15', 'Vault A'),
    ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'RZ-FLR-2026-03-20', 'flower', 'Runtz', 'LIC-123456', 520, 'active', 'submitted', '2026-03-20', 'Vault A'),
    ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'GMO-FLR-2026-03-10', 'flower', 'GMO Cookies', 'LIC-123456', 680, 'active', 'passed', '2026-03-10', 'Vault B'),
    ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'SS-FLR-2026-03-12', 'flower', 'Sunset Sherbert', 'LIC-123456', 350, 'active', 'not_submitted', '2026-03-12', 'Vault B'),
    ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'MAC-FLR-2026-03-08', 'flower', 'MAC 1', 'LIC-123456', 290, 'active', 'passed', '2026-03-08', 'Vault A');

-- ─── PACKAGES: TRIM & SHAKE ──────────────────────────────────────────────────
INSERT INTO packages (company_id, created_by, label, package_type, strain, license_number, quantity, status, packaged_date) VALUES
    ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'WC-TRIM-2026-03-15', 'trim', 'Wedding Cake', 'LIC-123456', 180, 'active', '2026-03-15'),
    ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'RZ-TRIM-2026-03-20', 'trim', 'Runtz', 'LIC-123456', 210, 'active', '2026-03-20'),
    ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'GMO-SHAKE-2026-03-10', 'shake', 'GMO Cookies', 'LIC-123456', 95, 'active', '2026-03-10'),
    ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'SS-SHAKE-2026-03-12', 'shake', 'Sunset Sherbert', 'LIC-123456', 120, 'active', '2026-03-12');

-- ─── PACKAGES: FRESH FROZEN ──────────────────────────────────────────────────
INSERT INTO packages (company_id, created_by, label, package_type, strain, license_number, quantity, status, packaged_date, location) VALUES
    ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'WFOG-FF-2026-02-28-A', 'fresh_frozen', 'Wi Fi OG', 'LIC-123456', 25000, 'active', '2026-02-28', 'Freezer 1'),
    ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'WFOG-FF-2026-02-28-B', 'fresh_frozen', 'Wi Fi OG', 'LIC-123456', 25000, 'active', '2026-02-28', 'Freezer 1'),
    ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'WFOG-FF-2026-03-05-A', 'fresh_frozen', 'Wi Fi OG', 'LIC-123456', 30000, 'active', '2026-03-05', 'Freezer 1'),
    ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'WFOG-FF-2026-03-05-B', 'fresh_frozen', 'Wi Fi OG', 'LIC-123456', 20000, 'active', '2026-03-05', 'Freezer 1'),
    ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'WFOG-FF-2026-03-10', 'fresh_frozen', 'Wi Fi OG', 'LIC-123456', 15000, 'active', '2026-03-10', 'Freezer 2'),
    ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'GEL-FF-2026-03-01', 'fresh_frozen', 'Gelato', 'LIC-123456', 8000, 'active', '2026-03-01', 'Freezer 2'),
    ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ICC-FF-2026-03-08', 'fresh_frozen', 'Ice Cream Cake', 'LIC-123456', 12000, 'active', '2026-03-08', 'Freezer 2'),
    ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'RZ-FF-2026-03-18', 'fresh_frozen', 'Runtz', 'LIC-123456', 18000, 'active', '2026-03-18', 'Freezer 1'),
    ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'GMO-FF-2026-03-12', 'fresh_frozen', 'GMO Cookies', 'LIC-123456', 22000, 'active', '2026-03-12', 'Freezer 2');

-- ─── PACKAGES: BUBBLE HASH ───────────────────────────────────────────────────
INSERT INTO packages (company_id, created_by, label, package_type, strain, license_number, quantity, status, packaged_date, location) VALUES
    ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'WFOG-BH-2026-03-15', 'bubble_hash', 'Wi Fi OG', 'LIC-123456', 1200, 'active', '2026-03-15', 'Hash Lab'),
    ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'WFOG-BH-2026-03-20', 'bubble_hash', 'Wi Fi OG', 'LIC-123456', 950, 'active', '2026-03-20', 'Hash Lab'),
    ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'GEL-BH-2026-03-18', 'bubble_hash', 'Gelato', 'LIC-123456', 380, 'active', '2026-03-18', 'Hash Lab'),
    ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ICC-BH-2026-03-22', 'bubble_hash', 'Ice Cream Cake', 'LIC-123456', 520, 'active', '2026-03-22', 'Hash Lab');

-- ─── PACKAGES: ROSIN ─────────────────────────────────────────────────────────
INSERT INTO packages (company_id, created_by, label, package_type, strain, license_number, quantity, status, packaged_date, location) VALUES
    ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'WFOG-ROSIN-2026-03-18', 'rosin', 'Wi Fi OG', 'LIC-123456', 680, 'active', '2026-03-18', 'Press Room'),
    ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'WFOG-ROSIN-2026-03-25', 'rosin', 'Wi Fi OG', 'LIC-123456', 540, 'active', '2026-03-25', 'Press Room'),
    ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'GEL-ROSIN-2026-03-22', 'rosin', 'Gelato', 'LIC-123456', 210, 'active', '2026-03-22', 'Press Room');

-- ─── PACKAGES: ROSIN CARTS ───────────────────────────────────────────────────
INSERT INTO packages (company_id, created_by, label, package_type, strain, license_number, quantity, unit, status, packaged_date, location) VALUES
    ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'WFOG-CART-2026-03-22', 'rosin_cart', 'Wi Fi OG', 'LIC-123456', 200, 'Each', 'active', '2026-03-22', 'Cart Room'),
    ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'WFOG-CART-2026-03-28', 'rosin_cart', 'Wi Fi OG', 'LIC-123456', 150, 'Each', 'active', '2026-03-28', 'Cart Room'),
    ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'GEL-CART-2026-03-25', 'rosin_cart', 'Gelato', 'LIC-123456', 80, 'Each', 'active', '2026-03-25', 'Cart Room');

-- ─── EXTRACTION LOGS (history) ───────────────────────────────────────────────
INSERT INTO extraction_logs (company_id, created_by, input_package_type, input_quantity, output_package_type, output_quantity, strain, license_number, extraction_type, yield_percentage, notes) VALUES
    ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'fresh_frozen', 25000, 'bubble_hash', 1200, 'Wi Fi OG', 'LIC-123456', 'wash', 4.8, '73u + 120u bags, ice water method'),
    ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'fresh_frozen', 20000, 'bubble_hash', 950, 'Wi Fi OG', 'LIC-123456', 'wash', 4.75, '73u + 120u bags'),
    ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'fresh_frozen', 8000, 'bubble_hash', 380, 'Gelato', 'LIC-123456', 'wash', 4.75, '90u full spectrum'),
    ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'fresh_frozen', 12000, 'bubble_hash', 520, 'Ice Cream Cake', 'LIC-123456', 'wash', 4.33, '73u + 120u bags'),
    ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bubble_hash', 1200, 'rosin', 680, 'Wi Fi OG', 'LIC-123456', 'press', 56.7, '190F, 2min, 37u bags'),
    ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bubble_hash', 950, 'rosin', 540, 'Wi Fi OG', 'LIC-123456', 'press', 56.8, '190F, 2min, 37u bags'),
    ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bubble_hash', 380, 'rosin', 210, 'Gelato', 'LIC-123456', 'press', 55.3, '185F, 90sec, 25u bags'),
    ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'rosin', 400, 'rosin_cart', 200, 'Wi Fi OG', 'LIC-123456', 'cart_fill', 50.0, '0.5g carts, 10% terps added'),
    ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'rosin', 300, 'rosin_cart', 150, 'Wi Fi OG', 'LIC-123456', 'cart_fill', 50.0, '0.5g carts, 10% terps'),
    ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'rosin', 80, 'rosin_cart', 80, 'Gelato', 'LIC-123456', 'cart_fill', 100.0, '1g carts, live rosin');
