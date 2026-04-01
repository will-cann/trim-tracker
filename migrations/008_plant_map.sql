-- Plant Map Module
-- Adds rooms, plants, and plant_batches for spatial facility visualization
-- Created: 2026-03-26

-- ============================================================================
-- ROOMS TABLE — Physical locations within a facility
-- ============================================================================
CREATE TABLE IF NOT EXISTS rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    room_type VARCHAR(50) CHECK (room_type IN ('nursery', 'veg', 'flower', 'dry', 'general')),
    capacity INTEGER CHECK (capacity IS NULL OR capacity > 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rooms_company_id ON rooms(company_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rooms_company_name ON rooms(company_id, LOWER(name));

CREATE TRIGGER update_rooms_updated_at BEFORE UPDATE ON rooms
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PLANTS TABLE — Individual tracked plants (Vegetative + Flowering phases)
-- ============================================================================
CREATE TABLE IF NOT EXISTS plants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    label VARCHAR(255) NOT NULL,
    strain_id UUID REFERENCES strains(id) ON DELETE SET NULL,
    strain_name VARCHAR(255) NOT NULL,
    room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
    growth_phase VARCHAR(20) NOT NULL CHECK (growth_phase IN ('vegetative', 'flowering', 'harvested', 'destroyed')),
    planted_date DATE,
    vegetative_date DATE,
    flowering_date DATE,
    harvested_date DATE,
    destroyed_date DATE,
    target_harvest_date DATE,
    harvest_id UUID REFERENCES harvests(id) ON DELETE SET NULL,
    plant_batch_id UUID,
    plant_health INTEGER NOT NULL DEFAULT 100 CHECK (plant_health >= 0 AND plant_health <= 100),
    contaminants TEXT[] NOT NULL DEFAULT '{}',
    is_on_hold BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plants_company_id ON plants(company_id);
CREATE INDEX IF NOT EXISTS idx_plants_company_phase ON plants(company_id, growth_phase);
CREATE INDEX IF NOT EXISTS idx_plants_room_id ON plants(room_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_plants_company_label ON plants(company_id, label);

CREATE TRIGGER update_plants_updated_at BEFORE UPDATE ON plants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PLANT BATCHES TABLE — Groups of immature/nursery plants
-- ============================================================================
CREATE TABLE IF NOT EXISTS plant_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    batch_type VARCHAR(50) CHECK (batch_type IN ('clone', 'seed', 'tissue_culture')),
    strain_id UUID REFERENCES strains(id) ON DELETE SET NULL,
    strain_name VARCHAR(255) NOT NULL,
    room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
    untracked_count INTEGER NOT NULL DEFAULT 0 CHECK (untracked_count >= 0),
    tracked_count INTEGER NOT NULL DEFAULT 0 CHECK (tracked_count >= 0),
    planted_date DATE,
    plant_health INTEGER NOT NULL DEFAULT 100 CHECK (plant_health >= 0 AND plant_health <= 100),
    contaminants TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plant_batches_company_id ON plant_batches(company_id);
CREATE INDEX IF NOT EXISTS idx_plant_batches_room_id ON plant_batches(room_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_plant_batches_company_name ON plant_batches(company_id, name);

CREATE TRIGGER update_plant_batches_updated_at BEFORE UPDATE ON plant_batches
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- SEED DATA — Demo rooms and plants for development
-- ============================================================================

-- Rooms for Green Valley Cultivation (company 11111111-...)
INSERT INTO rooms (company_id, name, room_type, capacity) VALUES
    ('11111111-1111-1111-1111-111111111111', 'Nursery A', 'nursery', 200),
    ('11111111-1111-1111-1111-111111111111', 'Veg Room 1', 'veg', 150),
    ('11111111-1111-1111-1111-111111111111', 'Veg Room 2', 'veg', 150),
    ('11111111-1111-1111-1111-111111111111', 'Flower Room 1', 'flower', 120),
    ('11111111-1111-1111-1111-111111111111', 'Flower Room 2', 'flower', 120),
    ('11111111-1111-1111-1111-111111111111', 'Flower Room 3', 'flower', 100)
ON CONFLICT (company_id, LOWER(name)) DO NOTHING;

-- Ensure strains exist for seed plants
INSERT INTO strains (company_id, name) VALUES
    ('11111111-1111-1111-1111-111111111111', 'Blue Dream'),
    ('11111111-1111-1111-1111-111111111111', 'OG Kush'),
    ('11111111-1111-1111-1111-111111111111', 'Gelato'),
    ('11111111-1111-1111-1111-111111111111', 'Wedding Cake'),
    ('11111111-1111-1111-1111-111111111111', 'Purple Punch'),
    ('11111111-1111-1111-1111-111111111111', 'Zkittlez')
ON CONFLICT (company_id, LOWER(name)) DO NOTHING;

-- Plant batches (nursery)
INSERT INTO plant_batches (company_id, name, batch_type, strain_name, room_id, untracked_count, planted_date, plant_health, contaminants)
SELECT
    '11111111-1111-1111-1111-111111111111',
    pb.name, pb.batch_type, pb.strain_name,
    r.id, pb.untracked_count, pb.planted_date::date, pb.plant_health, pb.contaminants
FROM (VALUES
    ('BD-Clone-2026-03', 'clone', 'Blue Dream', 'Nursery A', 48, '2026-03-10', 100, '{}'::text[]),
    ('GEL-Seed-2026-03', 'seed', 'Gelato', 'Nursery A', 24, '2026-03-15', 85, '{fungus_gnats}'::text[]),
    ('WC-Clone-2026-03', 'clone', 'Wedding Cake', 'Nursery A', 36, '2026-03-12', 92, '{}'::text[])
) AS pb(name, batch_type, strain_name, room_name, untracked_count, planted_date, plant_health, contaminants)
JOIN rooms r ON r.name = pb.room_name AND r.company_id = '11111111-1111-1111-1111-111111111111'
ON CONFLICT (company_id, name) DO NOTHING;

-- Vegetative plants
INSERT INTO plants (company_id, label, strain_name, room_id, growth_phase, planted_date, vegetative_date, target_harvest_date, plant_health, contaminants)
SELECT
    '11111111-1111-1111-1111-111111111111',
    p.label, p.strain_name, r.id,
    'vegetative', p.planted_date::date, p.veg_date::date, p.target_harvest::date, p.plant_health, p.contaminants
FROM (VALUES
    ('OGK-V-001', 'OG Kush', 'Veg Room 1', '2026-02-15', '2026-03-01', '2026-05-01', 100, '{}'::text[]),
    ('OGK-V-002', 'OG Kush', 'Veg Room 1', '2026-02-15', '2026-03-01', '2026-05-01', 100, '{}'::text[]),
    ('OGK-V-003', 'OG Kush', 'Veg Room 1', '2026-02-15', '2026-03-01', '2026-05-01', 95, '{}'::text[]),
    ('BD-V-001', 'Blue Dream', 'Veg Room 1', '2026-02-20', '2026-03-05', '2026-05-10', 88, '{thrips}'::text[]),
    ('BD-V-002', 'Blue Dream', 'Veg Room 1', '2026-02-20', '2026-03-05', '2026-05-10', 100, '{}'::text[]),
    ('PP-V-001', 'Purple Punch', 'Veg Room 2', '2026-02-18', '2026-03-03', '2026-05-05', 100, '{}'::text[]),
    ('PP-V-002', 'Purple Punch', 'Veg Room 2', '2026-02-18', '2026-03-03', '2026-05-05', 72, '{powdery_mildew}'::text[]),
    ('PP-V-003', 'Purple Punch', 'Veg Room 2', '2026-02-18', '2026-03-03', '2026-05-05', 100, '{}'::text[]),
    ('ZK-V-001', 'Zkittlez', 'Veg Room 2', '2026-02-25', '2026-03-10', '2026-05-15', 100, '{}'::text[]),
    ('ZK-V-002', 'Zkittlez', 'Veg Room 2', '2026-02-25', '2026-03-10', '2026-05-15', 100, '{}'::text[])
) AS p(label, strain_name, room_name, planted_date, veg_date, target_harvest, plant_health, contaminants)
JOIN rooms r ON r.name = p.room_name AND r.company_id = '11111111-1111-1111-1111-111111111111'
ON CONFLICT (company_id, label) DO NOTHING;

-- Flowering plants
INSERT INTO plants (company_id, label, strain_name, room_id, growth_phase, planted_date, vegetative_date, flowering_date, target_harvest_date, plant_health, contaminants)
SELECT
    '11111111-1111-1111-1111-111111111111',
    p.label, p.strain_name, r.id,
    'flowering', p.planted_date::date, p.veg_date::date, p.flower_date::date, p.target_harvest::date, p.plant_health, p.contaminants
FROM (VALUES
    ('GEL-F-001', 'Gelato', 'Flower Room 1', '2026-01-10', '2026-01-25', '2026-02-20', '2026-04-15', 100, '{}'::text[]),
    ('GEL-F-002', 'Gelato', 'Flower Room 1', '2026-01-10', '2026-01-25', '2026-02-20', '2026-04-15', 100, '{}'::text[]),
    ('GEL-F-003', 'Gelato', 'Flower Room 1', '2026-01-10', '2026-01-25', '2026-02-20', '2026-04-15', 78, '{spider_mites}'::text[]),
    ('GEL-F-004', 'Gelato', 'Flower Room 1', '2026-01-10', '2026-01-25', '2026-02-20', '2026-04-15', 100, '{}'::text[]),
    ('WC-F-001', 'Wedding Cake', 'Flower Room 1', '2026-01-15', '2026-01-30', '2026-02-25', '2026-04-20', 65, '{powdery_mildew,botrytis}'::text[]),
    ('WC-F-002', 'Wedding Cake', 'Flower Room 1', '2026-01-15', '2026-01-30', '2026-02-25', '2026-04-20', 100, '{}'::text[]),
    ('OGK-F-001', 'OG Kush', 'Flower Room 2', '2026-01-05', '2026-01-20', '2026-02-15', '2026-04-10', 100, '{}'::text[]),
    ('OGK-F-002', 'OG Kush', 'Flower Room 2', '2026-01-05', '2026-01-20', '2026-02-15', '2026-04-10', 100, '{}'::text[]),
    ('OGK-F-003', 'OG Kush', 'Flower Room 2', '2026-01-05', '2026-01-20', '2026-02-15', '2026-04-10', 90, '{thrips}'::text[]),
    ('BD-F-001', 'Blue Dream', 'Flower Room 2', '2026-01-12', '2026-01-27', '2026-02-22', '2026-04-18', 100, '{}'::text[]),
    ('BD-F-002', 'Blue Dream', 'Flower Room 2', '2026-01-12', '2026-01-27', '2026-02-22', '2026-04-18', 100, '{}'::text[]),
    ('PP-F-001', 'Purple Punch', 'Flower Room 3', '2026-01-20', '2026-02-05', '2026-03-01', '2026-04-25', 100, '{}'::text[]),
    ('PP-F-002', 'Purple Punch', 'Flower Room 3', '2026-01-20', '2026-02-05', '2026-03-01', '2026-04-25', 55, '{spider_mites,aphids}'::text[]),
    ('ZK-F-001', 'Zkittlez', 'Flower Room 3', '2026-01-22', '2026-02-07', '2026-03-03', '2026-04-28', 100, '{}'::text[]),
    ('ZK-F-002', 'Zkittlez', 'Flower Room 3', '2026-01-22', '2026-02-07', '2026-03-03', '2026-04-28', 100, '{}'::text[])
) AS p(label, strain_name, room_name, planted_date, veg_date, flower_date, target_harvest, plant_health, contaminants)
JOIN rooms r ON r.name = p.room_name AND r.company_id = '11111111-1111-1111-1111-111111111111'
ON CONFLICT (company_id, label) DO NOTHING;

-- Track migration
INSERT INTO schema_migrations (version) VALUES (8)
ON CONFLICT (version) DO NOTHING;
