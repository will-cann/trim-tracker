-- Package Inventory - Seed Data
-- Populates packages for Green Valley Cultivation (company 11111111...)
-- Uses dev user aaaaaaaa... as created_by

-- ============================================================================
-- SEED PACKAGES (Green Valley Cultivation)
-- ============================================================================

-- Flower packages from completed trim sessions
INSERT INTO packages (company_id, created_by, label, package_type, strain, license_number, quantity, waste_weight, location, status, lab_testing_state, packaged_date, notes)
VALUES
    ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
     'PKG-BD-F001', 'flower', 'Blue Dream', 'LIC-123456', 850.25, 12.5,
     'Vault A', 'active', 'passed', NOW() - INTERVAL '4 days',
     'Premium top-shelf flower from Harvest-BD-001'),

    ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
     'PKG-BD-T001', 'trim', 'Blue Dream', 'LIC-123456', 120.30, 5.2,
     'Vault A', 'active', 'not_submitted', NOW() - INTERVAL '4 days',
     NULL),

    ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
     'PKG-BD-S001', 'shake', 'Blue Dream', 'LIC-123456', 95.50, 3.1,
     'Vault A', 'active', 'not_submitted', NOW() - INTERVAL '4 days',
     NULL),

    ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
     'PKG-OG-F001', 'flower', 'OG Kush', 'LIC-123456', 400.25, 8.7,
     'Vault B', 'active', 'submitted', NOW() - INTERVAL '4 days',
     'Dense nugs, great terp profile'),

    ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
     'PKG-OG-T001', 'trim', 'OG Kush', 'LIC-123456', 100.45, 4.5,
     'Vault B', 'active', 'not_submitted', NOW() - INTERVAL '4 days',
     NULL),

    -- Sour Diesel packages
    ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
     'PKG-SD-F001', 'flower', 'Sour Diesel', 'LIC-123456', 980.75, 15.3,
     'Vault A', 'active', 'passed', NOW() - INTERVAL '1 day',
     'Excellent yield, lab results look great'),

    ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
     'PKG-SD-T001', 'trim', 'Sour Diesel', 'LIC-123456', 175.50, 6.8,
     'Processing Room', 'active', 'not_submitted', NOW() - INTERVAL '1 day',
     NULL),

    ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
     'PKG-SD-S001', 'shake', 'Sour Diesel', 'LIC-123456', 145.30, 4.2,
     'Processing Room', 'active', 'not_submitted', NOW() - INTERVAL '1 day',
     NULL),

    -- On-hold package (failed lab test)
    ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
     'PKG-GG-F001', 'flower', 'Gorilla Glue #4', 'LIC-123456', 325.50, 10.0,
     'Quarantine', 'on_hold', 'failed', NOW() - INTERVAL '2 days',
     'Failed for pesticide residue — pending remediation review'),

    -- Finished packages (old inventory)
    ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
     'PKG-WW-F001', 'flower', 'White Widow', 'LIC-123456', 620.00, 9.5,
     'Vault A', 'finished', 'passed', NOW() - INTERVAL '10 days',
     'Sold to dispensary — invoice #1042'),

    ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
     'PKG-WW-T001', 'trim', 'White Widow', 'LIC-123456', 85.00, 3.0,
     'Vault A', 'finished', 'passed', NOW() - INTERVAL '10 days',
     'Sent to extraction partner'),

    ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
     'PKG-GC-F001', 'flower', 'Girl Scout Cookies', 'LIC-123456', 445.75, 7.2,
     'Vault B', 'finished', 'passed', NOW() - INTERVAL '8 days',
     NULL);

-- Update finished_date for finished packages
UPDATE packages
SET finished_date = packaged_date + INTERVAL '2 days'
WHERE status = 'finished'
  AND company_id = '11111111-1111-1111-1111-111111111111';
