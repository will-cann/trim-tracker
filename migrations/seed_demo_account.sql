-- =============================================================================
-- DEMO SEED: Plants & packages for wgparkhurst demo account
-- Run: node scripts/run-migration.mjs migrations/seed_demo_account.sql
-- =============================================================================
-- company_id: d0d34e1c-3473-4416-908e-7acda1ad2124
-- user_id:    3c2d6e13-cb5a-4b55-af72-2d4536fc1692
-- license:    LIC-123456 (Facility A)

-- ─── EXTRA STRAINS ───────────────────────────────────────────────────────────
INSERT INTO strains (company_id, name) VALUES
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', 'GMO Cookies'),
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', 'Runtz'),
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', 'Sunset Sherbert'),
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', 'MAC 1'),
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', 'Purple Punch'),
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', 'Zkittlez')
ON CONFLICT (company_id, LOWER(name)) DO NOTHING;

-- ─── EXTRA ROOMS ─────────────────────────────────────────────────────────────
INSERT INTO rooms (company_id, name, room_type) VALUES
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', 'Nursery B', 'nursery'),
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', 'Veg Room 3', 'veg'),
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', 'Flower Room 4', 'flower')
ON CONFLICT DO NOTHING;

-- ─── NURSERY: PLANT BATCHES ──────────────────────────────────────────────────
INSERT INTO plant_batches (company_id, name, batch_type, strain_name, room_id, untracked_count, planted_date, plant_health, contaminants)
SELECT
    'd0d34e1c-3473-4416-908e-7acda1ad2124',
    b.name, b.batch_type, b.strain_name, r.id, b.cnt, b.planted::date, b.health, b.contam::text[]
FROM (VALUES
    ('Wi Fi OG Clones R2', 'clone', 'Wi Fi OG', 'Nursery A', 48, '2026-03-15', 100, '{}'),
    ('Gelato Clones', 'clone', 'Gelato', 'Nursery A', 36, '2026-03-18', 95, '{}'),
    ('GMO Cookies Seeds', 'seed', 'GMO Cookies', 'Nursery B', 24, '2026-03-20', 100, '{}'),
    ('Runtz Clones', 'clone', 'Runtz', 'Nursery B', 60, '2026-03-22', 90, '{powdery_mildew}'),
    ('MAC 1 Tissue Culture', 'tissue_culture', 'MAC 1', 'Nursery A', 12, '2026-03-10', 100, '{}'),
    ('Ice Cream Cake Clones', 'clone', 'Ice Cream Cake', 'Nursery B', 30, '2026-03-25', 100, '{}')
) AS b(name, batch_type, strain_name, room_name, cnt, planted, health, contam)
JOIN rooms r ON r.name = b.room_name AND r.company_id = 'd0d34e1c-3473-4416-908e-7acda1ad2124';

-- ─── VEG PLANTS ──────────────────────────────────────────────────────────────
-- Wi Fi OG in Veg Room 1 (20 plants)
INSERT INTO plants (company_id, label, strain_name, room_id, growth_phase, planted_date, vegetative_date, plant_health, contaminants)
SELECT 'd0d34e1c-3473-4416-908e-7acda1ad2124', 'WFOG-V2-' || LPAD(n::text, 3, '0'), 'Wi Fi OG', r.id,
    'vegetative', '2026-02-20'::date, '2026-03-06'::date,
    CASE WHEN n <= 18 THEN 100 ELSE 85 END,
    CASE WHEN n <= 18 THEN '{}'::text[] ELSE '{nutrient_deficiency}'::text[] END
FROM generate_series(1, 20) AS n
CROSS JOIN rooms r WHERE r.name = 'Veg Room 1' AND r.company_id = 'd0d34e1c-3473-4416-908e-7acda1ad2124';

-- Gelato in Veg Room 2 (15 plants)
INSERT INTO plants (company_id, label, strain_name, room_id, growth_phase, planted_date, vegetative_date, plant_health)
SELECT 'd0d34e1c-3473-4416-908e-7acda1ad2124', 'GEL-V2-' || LPAD(n::text, 3, '0'), 'Gelato', r.id,
    'vegetative', '2026-02-25'::date, '2026-03-11'::date, 100
FROM generate_series(1, 15) AS n
CROSS JOIN rooms r WHERE r.name = 'Veg Room 2' AND r.company_id = 'd0d34e1c-3473-4416-908e-7acda1ad2124';

-- GMO Cookies in Veg Room 3 (12 plants, 2 with spider mites)
INSERT INTO plants (company_id, label, strain_name, room_id, growth_phase, planted_date, vegetative_date, plant_health, contaminants)
SELECT 'd0d34e1c-3473-4416-908e-7acda1ad2124', 'GMO-V-' || LPAD(n::text, 3, '0'), 'GMO Cookies', r.id,
    'vegetative', '2026-03-01'::date, '2026-03-15'::date,
    CASE WHEN n <= 10 THEN 100 ELSE 70 END,
    CASE WHEN n <= 10 THEN '{}'::text[] ELSE '{spider_mites}'::text[] END
FROM generate_series(1, 12) AS n
CROSS JOIN rooms r WHERE r.name = 'Veg Room 3' AND r.company_id = 'd0d34e1c-3473-4416-908e-7acda1ad2124';

-- ─── FLOWERING PLANTS ────────────────────────────────────────────────────────
-- Wedding Cake in Flower Room 2 (18 plants, week 5, 2 with botrytis)
INSERT INTO plants (company_id, label, strain_name, room_id, growth_phase, planted_date, vegetative_date, flowering_date, target_harvest_date, plant_health, contaminants)
SELECT 'd0d34e1c-3473-4416-908e-7acda1ad2124', 'WC-F2-' || LPAD(n::text, 3, '0'), 'Wedding Cake', r.id,
    'flowering', '2026-01-15'::date, '2026-02-01'::date, '2026-02-25'::date, '2026-04-25'::date,
    CASE WHEN n <= 16 THEN 95 ELSE 75 END,
    CASE WHEN n <= 16 THEN '{}'::text[] ELSE '{botrytis}'::text[] END
FROM generate_series(1, 18) AS n
CROSS JOIN rooms r WHERE r.name = 'Flower Room 2' AND r.company_id = 'd0d34e1c-3473-4416-908e-7acda1ad2124';

-- Sunset Sherbert in Flower Room 3 (15 plants, week 3)
INSERT INTO plants (company_id, label, strain_name, room_id, growth_phase, planted_date, vegetative_date, flowering_date, target_harvest_date, plant_health)
SELECT 'd0d34e1c-3473-4416-908e-7acda1ad2124', 'SS-F-' || LPAD(n::text, 3, '0'), 'Sunset Sherbert', r.id,
    'flowering', '2026-01-25'::date, '2026-02-10'::date, '2026-03-10'::date, '2026-05-05'::date, 100
FROM generate_series(1, 15) AS n
CROSS JOIN rooms r WHERE r.name = 'Flower Room 3' AND r.company_id = 'd0d34e1c-3473-4416-908e-7acda1ad2124';

-- Runtz in Flower Room 4 (22 plants, week 7 — near harvest)
INSERT INTO plants (company_id, label, strain_name, room_id, growth_phase, planted_date, vegetative_date, flowering_date, target_harvest_date, plant_health)
SELECT 'd0d34e1c-3473-4416-908e-7acda1ad2124', 'RZ-F-' || LPAD(n::text, 3, '0'), 'Runtz', r.id,
    'flowering', '2026-01-05'::date, '2026-01-20'::date, '2026-02-10'::date, '2026-04-10'::date, 100
FROM generate_series(1, 22) AS n
CROSS JOIN rooms r WHERE r.name = 'Flower Room 4' AND r.company_id = 'd0d34e1c-3473-4416-908e-7acda1ad2124';

-- ─── PACKAGES: FLOWER ────────────────────────────────────────────────────────
INSERT INTO packages (company_id, created_by, label, package_type, strain, license_number, quantity, status, lab_testing_state, packaged_date, location) VALUES
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', '3c2d6e13-cb5a-4b55-af72-2d4536fc1692', 'WC-FLR-2026-03-15', 'flower', 'Wedding Cake', 'LIC-123456', 450, 'active', 'passed', '2026-03-15', 'Vault A'),
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', '3c2d6e13-cb5a-4b55-af72-2d4536fc1692', 'WC-FLR-2026-03-15-B', 'flower', 'Wedding Cake', 'LIC-123456', 380, 'active', 'passed', '2026-03-15', 'Vault A'),
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', '3c2d6e13-cb5a-4b55-af72-2d4536fc1692', 'RZ-FLR-2026-03-20', 'flower', 'Runtz', 'LIC-123456', 520, 'active', 'submitted', '2026-03-20', 'Vault A'),
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', '3c2d6e13-cb5a-4b55-af72-2d4536fc1692', 'GMO-FLR-2026-03-10', 'flower', 'GMO Cookies', 'LIC-123456', 680, 'active', 'passed', '2026-03-10', 'Vault B'),
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', '3c2d6e13-cb5a-4b55-af72-2d4536fc1692', 'SS-FLR-2026-03-12', 'flower', 'Sunset Sherbert', 'LIC-123456', 350, 'active', 'not_submitted', '2026-03-12', 'Vault B'),
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', '3c2d6e13-cb5a-4b55-af72-2d4536fc1692', 'MAC-FLR-2026-03-08', 'flower', 'MAC 1', 'LIC-123456', 290, 'active', 'passed', '2026-03-08', 'Vault A'),
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', '3c2d6e13-cb5a-4b55-af72-2d4536fc1692', 'WFOG-FLR-2026-03-22', 'flower', 'Wi Fi OG', 'LIC-123456', 610, 'active', 'passed', '2026-03-22', 'Vault A'),
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', '3c2d6e13-cb5a-4b55-af72-2d4536fc1692', 'GEL-FLR-2026-03-18', 'flower', 'Gelato', 'LIC-123456', 420, 'active', 'passed', '2026-03-18', 'Vault B');

-- ─── PACKAGES: TRIM & SHAKE ──────────────────────────────────────────────────
INSERT INTO packages (company_id, created_by, label, package_type, strain, license_number, quantity, status, packaged_date) VALUES
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', '3c2d6e13-cb5a-4b55-af72-2d4536fc1692', 'WC-TRIM-2026-03-15', 'trim', 'Wedding Cake', 'LIC-123456', 180, 'active', '2026-03-15'),
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', '3c2d6e13-cb5a-4b55-af72-2d4536fc1692', 'RZ-TRIM-2026-03-20', 'trim', 'Runtz', 'LIC-123456', 210, 'active', '2026-03-20'),
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', '3c2d6e13-cb5a-4b55-af72-2d4536fc1692', 'WFOG-TRIM-2026-03-22', 'trim', 'Wi Fi OG', 'LIC-123456', 250, 'active', '2026-03-22'),
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', '3c2d6e13-cb5a-4b55-af72-2d4536fc1692', 'GMO-SHAKE-2026-03-10', 'shake', 'GMO Cookies', 'LIC-123456', 95, 'active', '2026-03-10'),
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', '3c2d6e13-cb5a-4b55-af72-2d4536fc1692', 'SS-SHAKE-2026-03-12', 'shake', 'Sunset Sherbert', 'LIC-123456', 120, 'active', '2026-03-12'),
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', '3c2d6e13-cb5a-4b55-af72-2d4536fc1692', 'GEL-SHAKE-2026-03-18', 'shake', 'Gelato', 'LIC-123456', 85, 'active', '2026-03-18');

-- ─── PACKAGES: FRESH FROZEN (big inventory for extraction demos) ─────────────
INSERT INTO packages (company_id, created_by, label, package_type, strain, license_number, quantity, status, packaged_date, location) VALUES
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', '3c2d6e13-cb5a-4b55-af72-2d4536fc1692', 'WFOG-FF-2026-02-28-A', 'fresh_frozen', 'Wi Fi OG', 'LIC-123456', 25000, 'active', '2026-02-28', 'Freezer 1'),
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', '3c2d6e13-cb5a-4b55-af72-2d4536fc1692', 'WFOG-FF-2026-02-28-B', 'fresh_frozen', 'Wi Fi OG', 'LIC-123456', 25000, 'active', '2026-02-28', 'Freezer 1'),
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', '3c2d6e13-cb5a-4b55-af72-2d4536fc1692', 'WFOG-FF-2026-03-05-A', 'fresh_frozen', 'Wi Fi OG', 'LIC-123456', 30000, 'active', '2026-03-05', 'Freezer 1'),
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', '3c2d6e13-cb5a-4b55-af72-2d4536fc1692', 'WFOG-FF-2026-03-05-B', 'fresh_frozen', 'Wi Fi OG', 'LIC-123456', 20000, 'active', '2026-03-05', 'Freezer 1'),
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', '3c2d6e13-cb5a-4b55-af72-2d4536fc1692', 'WFOG-FF-2026-03-10', 'fresh_frozen', 'Wi Fi OG', 'LIC-123456', 15000, 'active', '2026-03-10', 'Freezer 2'),
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', '3c2d6e13-cb5a-4b55-af72-2d4536fc1692', 'WFOG-FF-2026-03-15', 'fresh_frozen', 'Wi Fi OG', 'LIC-123456', 18000, 'active', '2026-03-15', 'Freezer 2'),
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', '3c2d6e13-cb5a-4b55-af72-2d4536fc1692', 'GEL-FF-2026-03-01', 'fresh_frozen', 'Gelato', 'LIC-123456', 8000, 'active', '2026-03-01', 'Freezer 2'),
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', '3c2d6e13-cb5a-4b55-af72-2d4536fc1692', 'ICC-FF-2026-03-08', 'fresh_frozen', 'Ice Cream Cake', 'LIC-123456', 12000, 'active', '2026-03-08', 'Freezer 2'),
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', '3c2d6e13-cb5a-4b55-af72-2d4536fc1692', 'RZ-FF-2026-03-18', 'fresh_frozen', 'Runtz', 'LIC-123456', 18000, 'active', '2026-03-18', 'Freezer 1'),
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', '3c2d6e13-cb5a-4b55-af72-2d4536fc1692', 'GMO-FF-2026-03-12', 'fresh_frozen', 'GMO Cookies', 'LIC-123456', 22000, 'active', '2026-03-12', 'Freezer 2'),
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', '3c2d6e13-cb5a-4b55-af72-2d4536fc1692', 'SS-FF-2026-03-14', 'fresh_frozen', 'Sunset Sherbert', 'LIC-123456', 14000, 'active', '2026-03-14', 'Freezer 1'),
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', '3c2d6e13-cb5a-4b55-af72-2d4536fc1692', 'WC-FF-2026-03-20', 'fresh_frozen', 'Wedding Cake', 'LIC-123456', 16000, 'active', '2026-03-20', 'Freezer 1');

-- ─── PACKAGES: BUBBLE HASH ───────────────────────────────────────────────────
INSERT INTO packages (company_id, created_by, label, package_type, strain, license_number, quantity, status, packaged_date, location) VALUES
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', '3c2d6e13-cb5a-4b55-af72-2d4536fc1692', 'WFOG-BH-2026-03-15', 'bubble_hash', 'Wi Fi OG', 'LIC-123456', 1200, 'active', '2026-03-15', 'Hash Lab'),
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', '3c2d6e13-cb5a-4b55-af72-2d4536fc1692', 'WFOG-BH-2026-03-20', 'bubble_hash', 'Wi Fi OG', 'LIC-123456', 950, 'active', '2026-03-20', 'Hash Lab'),
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', '3c2d6e13-cb5a-4b55-af72-2d4536fc1692', 'GEL-BH-2026-03-18', 'bubble_hash', 'Gelato', 'LIC-123456', 380, 'active', '2026-03-18', 'Hash Lab'),
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', '3c2d6e13-cb5a-4b55-af72-2d4536fc1692', 'ICC-BH-2026-03-22', 'bubble_hash', 'Ice Cream Cake', 'LIC-123456', 520, 'active', '2026-03-22', 'Hash Lab'),
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', '3c2d6e13-cb5a-4b55-af72-2d4536fc1692', 'RZ-BH-2026-03-25', 'bubble_hash', 'Runtz', 'LIC-123456', 680, 'active', '2026-03-25', 'Hash Lab');

-- ─── PACKAGES: ROSIN ─────────────────────────────────────────────────────────
INSERT INTO packages (company_id, created_by, label, package_type, strain, license_number, quantity, status, packaged_date, location) VALUES
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', '3c2d6e13-cb5a-4b55-af72-2d4536fc1692', 'WFOG-ROSIN-2026-03-18', 'rosin', 'Wi Fi OG', 'LIC-123456', 680, 'active', '2026-03-18', 'Press Room'),
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', '3c2d6e13-cb5a-4b55-af72-2d4536fc1692', 'WFOG-ROSIN-2026-03-25', 'rosin', 'Wi Fi OG', 'LIC-123456', 540, 'active', '2026-03-25', 'Press Room'),
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', '3c2d6e13-cb5a-4b55-af72-2d4536fc1692', 'GEL-ROSIN-2026-03-22', 'rosin', 'Gelato', 'LIC-123456', 210, 'active', '2026-03-22', 'Press Room'),
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', '3c2d6e13-cb5a-4b55-af72-2d4536fc1692', 'RZ-ROSIN-2026-03-28', 'rosin', 'Runtz', 'LIC-123456', 390, 'active', '2026-03-28', 'Press Room');

-- ─── PACKAGES: ROSIN CARTS ───────────────────────────────────────────────────
INSERT INTO packages (company_id, created_by, label, package_type, strain, license_number, quantity, unit, status, packaged_date, location) VALUES
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', '3c2d6e13-cb5a-4b55-af72-2d4536fc1692', 'WFOG-CART-2026-03-22', 'rosin_cart', 'Wi Fi OG', 'LIC-123456', 200, 'Each', 'active', '2026-03-22', 'Cart Room'),
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', '3c2d6e13-cb5a-4b55-af72-2d4536fc1692', 'WFOG-CART-2026-03-28', 'rosin_cart', 'Wi Fi OG', 'LIC-123456', 150, 'Each', 'active', '2026-03-28', 'Cart Room'),
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', '3c2d6e13-cb5a-4b55-af72-2d4536fc1692', 'GEL-CART-2026-03-25', 'rosin_cart', 'Gelato', 'LIC-123456', 80, 'Each', 'active', '2026-03-25', 'Cart Room'),
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', '3c2d6e13-cb5a-4b55-af72-2d4536fc1692', 'RZ-CART-2026-03-30', 'rosin_cart', 'Runtz', 'LIC-123456', 120, 'Each', 'active', '2026-03-30', 'Cart Room');

-- ─── EXTRACTION LOGS (history) ───────────────────────────────────────────────
INSERT INTO extraction_logs (company_id, created_by, input_package_type, input_quantity, output_package_type, output_quantity, strain, license_number, extraction_type, yield_percentage, notes) VALUES
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', '3c2d6e13-cb5a-4b55-af72-2d4536fc1692', 'fresh_frozen', 25000, 'bubble_hash', 1200, 'Wi Fi OG', 'LIC-123456', 'wash', 4.8, '73u + 120u bags, ice water method'),
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', '3c2d6e13-cb5a-4b55-af72-2d4536fc1692', 'fresh_frozen', 20000, 'bubble_hash', 950, 'Wi Fi OG', 'LIC-123456', 'wash', 4.75, '73u + 120u bags'),
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', '3c2d6e13-cb5a-4b55-af72-2d4536fc1692', 'fresh_frozen', 8000, 'bubble_hash', 380, 'Gelato', 'LIC-123456', 'wash', 4.75, '90u full spectrum'),
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', '3c2d6e13-cb5a-4b55-af72-2d4536fc1692', 'fresh_frozen', 12000, 'bubble_hash', 520, 'Ice Cream Cake', 'LIC-123456', 'wash', 4.33, '73u + 120u bags'),
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', '3c2d6e13-cb5a-4b55-af72-2d4536fc1692', 'fresh_frozen', 18000, 'bubble_hash', 680, 'Runtz', 'LIC-123456', 'wash', 3.78, '73u + 120u + 160u bags'),
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', '3c2d6e13-cb5a-4b55-af72-2d4536fc1692', 'bubble_hash', 1200, 'rosin', 680, 'Wi Fi OG', 'LIC-123456', 'press', 56.7, '190F, 2min, 37u bags'),
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', '3c2d6e13-cb5a-4b55-af72-2d4536fc1692', 'bubble_hash', 950, 'rosin', 540, 'Wi Fi OG', 'LIC-123456', 'press', 56.8, '190F, 2min, 37u bags'),
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', '3c2d6e13-cb5a-4b55-af72-2d4536fc1692', 'bubble_hash', 380, 'rosin', 210, 'Gelato', 'LIC-123456', 'press', 55.3, '185F, 90sec, 25u bags'),
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', '3c2d6e13-cb5a-4b55-af72-2d4536fc1692', 'bubble_hash', 680, 'rosin', 390, 'Runtz', 'LIC-123456', 'press', 57.4, '190F, 2min, 37u bags'),
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', '3c2d6e13-cb5a-4b55-af72-2d4536fc1692', 'rosin', 400, 'rosin_cart', 200, 'Wi Fi OG', 'LIC-123456', 'cart_fill', 50.0, '0.5g carts, 10% terps added'),
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', '3c2d6e13-cb5a-4b55-af72-2d4536fc1692', 'rosin', 300, 'rosin_cart', 150, 'Wi Fi OG', 'LIC-123456', 'cart_fill', 50.0, '0.5g carts, 10% terps'),
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', '3c2d6e13-cb5a-4b55-af72-2d4536fc1692', 'rosin', 80, 'rosin_cart', 80, 'Gelato', 'LIC-123456', 'cart_fill', 100.0, '1g carts, live rosin'),
    ('d0d34e1c-3473-4416-908e-7acda1ad2124', '3c2d6e13-cb5a-4b55-af72-2d4536fc1692', 'rosin', 120, 'rosin_cart', 120, 'Runtz', 'LIC-123456', 'cart_fill', 100.0, '1g carts, live rosin');
