-- ============================================================================
-- Migration 016: Rooms Expansion
-- Adds square_footage and notes to rooms, creates room_equipment table
-- ============================================================================

-- Add new columns to rooms
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS square_footage NUMERIC(10,2) CHECK (square_footage IS NULL OR square_footage > 0);
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS notes TEXT;

-- ============================================================================
-- Room Equipment Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS room_equipment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    equipment_type VARCHAR(50) NOT NULL CHECK (equipment_type IN ('light', 'hvac', 'dehumidifier', 'fan', 'co2_generator', 'other')),
    name VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    specs JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_room_equipment_room_id ON room_equipment(room_id);
CREATE INDEX IF NOT EXISTS idx_room_equipment_company_id ON room_equipment(company_id);

CREATE TRIGGER update_room_equipment_updated_at BEFORE UPDATE ON room_equipment
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Seed: Update demo rooms with square footage
-- ============================================================================

DO $$
DECLARE
    v_company_id UUID;
BEGIN
    SELECT id INTO v_company_id FROM companies WHERE name = 'Green Valley Cultivation' LIMIT 1;
    IF v_company_id IS NOT NULL THEN
        UPDATE rooms SET square_footage = 400 WHERE company_id = v_company_id AND LOWER(name) = 'nursery a';
        UPDATE rooms SET square_footage = 800 WHERE company_id = v_company_id AND LOWER(name) = 'veg room 1';
        UPDATE rooms SET square_footage = 800 WHERE company_id = v_company_id AND LOWER(name) = 'veg room 2';
        UPDATE rooms SET square_footage = 1200 WHERE company_id = v_company_id AND LOWER(name) = 'flower room 1';
        UPDATE rooms SET square_footage = 1200 WHERE company_id = v_company_id AND LOWER(name) = 'flower room 2';
        UPDATE rooms SET square_footage = 1000 WHERE company_id = v_company_id AND LOWER(name) = 'flower room 3';

        -- Add sample lighting equipment
        INSERT INTO room_equipment (room_id, company_id, equipment_type, name, quantity, specs)
        SELECT r.id, v_company_id, 'light', 'Gavita Pro 1700e LED', 24, '{"wattage": 645, "lightType": "LED", "brand": "Gavita"}'::jsonb
        FROM rooms r WHERE r.company_id = v_company_id AND LOWER(r.name) = 'flower room 1'
        ON CONFLICT DO NOTHING;

        INSERT INTO room_equipment (room_id, company_id, equipment_type, name, quantity, specs)
        SELECT r.id, v_company_id, 'light', 'Gavita Pro 1700e LED', 24, '{"wattage": 645, "lightType": "LED", "brand": "Gavita"}'::jsonb
        FROM rooms r WHERE r.company_id = v_company_id AND LOWER(r.name) = 'flower room 2'
        ON CONFLICT DO NOTHING;

        INSERT INTO room_equipment (room_id, company_id, equipment_type, name, quantity, specs)
        SELECT r.id, v_company_id, 'light', 'Fluence SPYDR 2x LED', 16, '{"wattage": 630, "lightType": "LED", "brand": "Fluence"}'::jsonb
        FROM rooms r WHERE r.company_id = v_company_id AND LOWER(r.name) = 'veg room 1'
        ON CONFLICT DO NOTHING;

        INSERT INTO room_equipment (room_id, company_id, equipment_type, name, quantity, specs)
        SELECT r.id, v_company_id, 'dehumidifier', 'Quest 506 Commercial', 2, '{"capacity": "506 pints/day", "brand": "Quest"}'::jsonb
        FROM rooms r WHERE r.company_id = v_company_id AND LOWER(r.name) = 'flower room 1'
        ON CONFLICT DO NOTHING;

        INSERT INTO room_equipment (room_id, company_id, equipment_type, name, quantity, specs)
        SELECT r.id, v_company_id, 'fan', 'Hurricane Pro 20"', 8, '{"brand": "Hurricane"}'::jsonb
        FROM rooms r WHERE r.company_id = v_company_id AND LOWER(r.name) = 'flower room 1'
        ON CONFLICT DO NOTHING;
    END IF;
END $$;
