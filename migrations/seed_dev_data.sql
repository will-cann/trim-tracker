-- Trim Tracker MVP - Development Seed Data
-- PostgreSQL Seed Script for Local Testing
-- Created: 2025-12-27

-- WARNING: This file contains test data only. Do NOT run in production.

-- ============================================================================
-- SEED COMPANIES
-- ============================================================================

-- Company 1: Green Valley Cultivation
INSERT INTO companies (id, name, created_at)
VALUES (
    '11111111-1111-1111-1111-111111111111',
    'Green Valley Cultivation',
    NOW() - INTERVAL '30 days'
);

-- Company 2: Summit Gardens
INSERT INTO companies (id, name, created_at)
VALUES (
    '22222222-2222-2222-2222-222222222222',
    'Summit Gardens',
    NOW() - INTERVAL '15 days'
);

-- ============================================================================
-- SEED USERS
-- ============================================================================

-- Green Valley Admin
INSERT INTO users (id, company_id, email, name, role, created_at)
VALUES (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '11111111-1111-1111-1111-111111111111',
    'admin@greenvalley.com',
    'Sarah Martinez',
    'admin',
    NOW() - INTERVAL '30 days'
);

-- Green Valley Worker
INSERT INTO users (id, company_id, email, name, role, created_at)
VALUES (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    '11111111-1111-1111-1111-111111111111',
    'worker@greenvalley.com',
    'Mike Johnson',
    'worker',
    NOW() - INTERVAL '25 days'
);

-- Summit Gardens Admin
INSERT INTO users (id, company_id, email, name, role, created_at)
VALUES (
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    '22222222-2222-2222-2222-222222222222',
    'admin@summitgardens.com',
    'Emily Chen',
    'admin',
    NOW() - INTERVAL '15 days'
);

-- ============================================================================
-- SEED TRIMMER PROFILES (Green Valley)
-- ============================================================================

INSERT INTO trimmer_profiles (id, company_id, name, status, created_at)
VALUES
    ('tp111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Alex Rivera', 'active', NOW() - INTERVAL '20 days'),
    ('tp222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Jordan Lee', 'active', NOW() - INTERVAL '20 days'),
    ('tp333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Taylor Morgan', 'active', NOW() - INTERVAL '18 days'),
    ('tp444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', 'Casey Brooks', 'inactive', NOW() - INTERVAL '15 days');

-- ============================================================================
-- SEED TRIMMER PROFILES (Summit Gardens)
-- ============================================================================

INSERT INTO trimmer_profiles (id, company_id, name, status, created_at)
VALUES
    ('tp555555-5555-5555-5555-555555555555', '22222222-2222-2222-2222-222222222222', 'Sam Williams', 'active', NOW() - INTERVAL '10 days'),
    ('tp666666-6666-6666-6666-666666666666', '22222222-2222-2222-2222-222222222222', 'Jamie Davis', 'active', NOW() - INTERVAL '10 days');

-- ============================================================================
-- SEED COMPLETED SESSION 1 (Green Valley - 5 days ago)
-- ============================================================================

-- Session
INSERT INTO trim_sessions (id, company_id, created_by, start_time, end_time, completed_at, total_flower, total_shake, total_trim, total_waste, created_at)
VALUES (
    'ts111111-1111-1111-1111-111111111111',
    '11111111-1111-1111-1111-111111111111',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    NOW() - INTERVAL '5 days 8 hours',
    NOW() - INTERVAL '5 days',
    NOW() - INTERVAL '5 days',
    1250.50,
    180.25,
    220.75,
    95.30,
    NOW() - INTERVAL '5 days 8 hours'
);

-- Entry 1: Blue Dream
INSERT INTO trim_entries (id, session_id, harvest_name, license_number, strain, start_weight, flower_weight, shake_weight, trim_weight, waste_weight, status, created_at)
VALUES (
    'te111111-1111-1111-1111-111111111111',
    'ts111111-1111-1111-1111-111111111111',
    'Harvest-BD-001',
    'LIC-123456',
    'Blue Dream',
    2000.00,
    850.25,
    95.50,
    120.30,
    45.20,
    'submitted',
    NOW() - INTERVAL '5 days 8 hours'
);

-- Trimmers for Entry 1
INSERT INTO trimmers (id, entry_id, profile_id, name, start_time, end_time, flower_weight, shake_weight, trim_weight, waste_weight, created_at)
VALUES
    (gen_random_uuid(), 'te111111-1111-1111-1111-111111111111', 'tp111111-1111-1111-1111-111111111111', 'Alex Rivera', '08:00', '12:00', 450.00, 50.00, 60.00, 20.00, NOW() - INTERVAL '5 days 8 hours'),
    (gen_random_uuid(), 'te111111-1111-1111-1111-111111111111', 'tp222222-2222-2222-2222-222222222222', 'Jordan Lee', '08:30', '12:30', 400.25, 45.50, 60.30, 25.20, NOW() - INTERVAL '5 days 7.5 hours');

-- Entry 2: OG Kush
INSERT INTO trim_entries (id, session_id, harvest_name, license_number, strain, start_weight, flower_weight, shake_weight, trim_weight, waste_weight, status, created_at)
VALUES (
    'te222222-2222-2222-2222-222222222222',
    'ts111111-1111-1111-1111-111111111111',
    'Harvest-OG-002',
    'LIC-123456',
    'OG Kush',
    1500.00,
    400.25,
    84.75,
    100.45,
    50.10,
    'submitted',
    NOW() - INTERVAL '5 days 7 hours'
);

-- Trimmers for Entry 2
INSERT INTO trimmers (id, entry_id, profile_id, name, start_time, end_time, flower_weight, shake_weight, trim_weight, waste_weight, created_at)
VALUES
    (gen_random_uuid(), 'te222222-2222-2222-2222-222222222222', 'tp333333-3333-3333-3333-333333333333', 'Taylor Morgan', '13:00', '17:00', 400.25, 84.75, 100.45, 50.10, NOW() - INTERVAL '5 days 4 hours');

-- ============================================================================
-- SEED COMPLETED SESSION 2 (Green Valley - 2 days ago)
-- ============================================================================

INSERT INTO trim_sessions (id, company_id, created_by, start_time, end_time, completed_at, total_flower, total_shake, total_trim, total_waste, created_at)
VALUES (
    'ts222222-2222-2222-2222-222222222222',
    '11111111-1111-1111-1111-111111111111',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    NOW() - INTERVAL '2 days 9 hours',
    NOW() - INTERVAL '2 days',
    NOW() - INTERVAL '2 days',
    980.75,
    145.30,
    175.50,
    72.45,
    NOW() - INTERVAL '2 days 9 hours'
);

-- Entry: Sour Diesel
INSERT INTO trim_entries (id, session_id, harvest_name, license_number, strain, start_weight, flower_weight, shake_weight, trim_weight, waste_weight, status, created_at)
VALUES (
    'te333333-3333-3333-3333-333333333333',
    'ts222222-2222-2222-2222-222222222222',
    'Harvest-SD-003',
    'LIC-123456',
    'Sour Diesel',
    1800.00,
    980.75,
    145.30,
    175.50,
    72.45,
    'submitted',
    NOW() - INTERVAL '2 days 9 hours'
);

-- Trimmers for Entry
INSERT INTO trimmers (id, entry_id, profile_id, name, start_time, end_time, flower_weight, shake_weight, trim_weight, waste_weight, created_at)
VALUES
    (gen_random_uuid(), 'te333333-3333-3333-3333-333333333333', 'tp111111-1111-1111-1111-111111111111', 'Alex Rivera', '08:00', '13:00', 520.50, 75.00, 90.00, 35.00, NOW() - INTERVAL '2 days 9 hours'),
    (gen_random_uuid(), 'te333333-3333-3333-3333-333333333333', 'tp222222-2222-2222-2222-222222222222', 'Jordan Lee', '08:00', '13:30', 460.25, 70.30, 85.50, 37.45, NOW() - INTERVAL '2 days 9 hours');

-- ============================================================================
-- SEED COMPLETED SESSION 3 (Summit Gardens - 1 day ago)
-- ============================================================================

INSERT INTO trim_sessions (id, company_id, created_by, start_time, end_time, completed_at, total_flower, total_shake, total_trim, total_waste, created_at)
VALUES (
    'ts333333-3333-3333-3333-333333333333',
    '22222222-2222-2222-2222-222222222222',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    NOW() - INTERVAL '1 day 7 hours',
    NOW() - INTERVAL '1 day',
    NOW() - INTERVAL '1 day',
    750.25,
    110.50,
    135.75,
    58.20,
    NOW() - INTERVAL '1 day 7 hours'
);

-- Entry: Purple Haze
INSERT INTO trim_entries (id, session_id, harvest_name, license_number, strain, start_weight, flower_weight, shake_weight, trim_weight, waste_weight, status, created_at)
VALUES (
    'te444444-4444-4444-4444-444444444444',
    'ts333333-3333-3333-3333-333333333333',
    'Harvest-PH-001',
    'LIC-789012',
    'Purple Haze',
    1500.00,
    750.25,
    110.50,
    135.75,
    58.20,
    'submitted',
    NOW() - INTERVAL '1 day 7 hours'
);

-- Trimmers for Entry
INSERT INTO trimmers (id, entry_id, profile_id, name, start_time, end_time, flower_weight, shake_weight, trim_weight, waste_weight, created_at)
VALUES
    (gen_random_uuid(), 'te444444-4444-4444-4444-444444444444', 'tp555555-5555-5555-5555-555555555555', 'Sam Williams', '09:00', '14:00', 400.00, 55.00, 70.00, 30.00, NOW() - INTERVAL '1 day 7 hours'),
    (gen_random_uuid(), 'te444444-4444-4444-4444-444444444444', 'tp666666-6666-6666-6666-666666666666', 'Jamie Davis', '09:00', '13:30', 350.25, 55.50, 65.75, 28.20, NOW() - INTERVAL '1 day 7 hours');

-- ============================================================================
-- SEED ACTIVE SESSION (Green Valley - currently in progress)
-- ============================================================================

-- Active Session (no completed_at)
INSERT INTO trim_sessions (id, company_id, created_by, start_time, total_flower, total_shake, total_trim, total_waste, created_at)
VALUES (
    'ts-active-1111-1111-1111-111111111111',
    '11111111-1111-1111-1111-111111111111',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    NOW() - INTERVAL '3 hours',
    325.50,
    45.25,
    58.75,
    22.10,
    NOW() - INTERVAL '3 hours'
);

-- Active Entry
INSERT INTO trim_entries (id, session_id, harvest_name, license_number, strain, start_weight, flower_weight, shake_weight, trim_weight, waste_weight, status, created_at)
VALUES (
    'te-active-1111-1111-1111-111111111111',
    'ts-active-1111-1111-1111-111111111111',
    'Harvest-GG-004',
    'LIC-123456',
    'Gorilla Glue #4',
    1000.00,
    325.50,
    45.25,
    58.75,
    22.10,
    'active',
    NOW() - INTERVAL '3 hours'
);

-- Active Trimmers
INSERT INTO trimmers (id, entry_id, profile_id, name, start_time, end_time, flower_weight, shake_weight, trim_weight, waste_weight, created_at)
VALUES
    (gen_random_uuid(), 'te-active-1111-1111-1111-111111111111', 'tp111111-1111-1111-1111-111111111111', 'Alex Rivera', '09:00', '12:00', 180.00, 25.00, 30.00, 12.00, NOW() - INTERVAL '3 hours'),
    (gen_random_uuid(), 'te-active-1111-1111-1111-111111111111', 'tp222222-2222-2222-2222-222222222222', 'Jordan Lee', '09:30', NULL, 145.50, 20.25, 28.75, 10.10, NOW() - INTERVAL '2.5 hours');

-- Upcoming Entry (planned for tomorrow)
INSERT INTO trim_entries (id, session_id, harvest_name, license_number, strain, start_weight, status, planned_trim_date, planned_method, created_at)
VALUES (
    'te-upcoming-2222-2222-2222-222222222',
    'ts-active-1111-1111-1111-111111111111',
    'Harvest-WW-005',
    'LIC-123456',
    'White Widow',
    1200.00,
    'upcoming',
    CURRENT_DATE + INTERVAL '1 day',
    'scissors',
    NOW() - INTERVAL '2 hours'
);

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Uncomment to verify seed data after running:

-- SELECT 'Companies' as table_name, COUNT(*) as count FROM companies
-- UNION ALL
-- SELECT 'Users', COUNT(*) FROM users
-- UNION ALL
-- SELECT 'Trimmer Profiles', COUNT(*) FROM trimmer_profiles
-- UNION ALL
-- SELECT 'Trim Sessions', COUNT(*) FROM trim_sessions
-- UNION ALL
-- SELECT 'Trim Entries', COUNT(*) FROM trim_entries
-- UNION ALL
-- SELECT 'Trimmers', COUNT(*) FROM trimmers;

-- Test multi-tenancy isolation:
-- SELECT
--     c.name as company,
--     COUNT(DISTINCT ts.id) as sessions,
--     COUNT(DISTINCT te.id) as entries,
--     COUNT(DISTINCT t.id) as trimmers
-- FROM companies c
-- LEFT JOIN trim_sessions ts ON ts.company_id = c.id
-- LEFT JOIN trim_entries te ON te.session_id = ts.id
-- LEFT JOIN trimmers t ON t.entry_id = te.id
-- GROUP BY c.id, c.name;

-- ============================================================================
-- END OF SEED DATA
-- ============================================================================
