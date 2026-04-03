-- Seed extraction equipment for the dev/demo company
-- Run after 028_extraction_equipment_templates.sql

-- Get the first company ID (dev company)
DO $$
DECLARE
    v_company_id UUID;
BEGIN
    SELECT id INTO v_company_id FROM companies LIMIT 1;
    IF v_company_id IS NULL THEN RETURN; END IF;

    -- Skip if already seeded
    IF EXISTS (SELECT 1 FROM extraction_equipment WHERE company_id = v_company_id LIMIT 1) THEN RETURN; END IF;

    -- Wash vessels
    INSERT INTO extraction_equipment (company_id, name, equipment_type, capacity_grams, notes, status) VALUES
        (v_company_id, 'Bruteless 20 Gal', 'wash_vessel', 2500, '20 gallon wash vessel, 4 bag set (45u, 73u, 120u, 160u)', 'available'),
        (v_company_id, 'Bruteless 44 Gal', 'wash_vessel', 5000, '44 gallon wash vessel, 4 bag set', 'available');

    -- Freeze dryers
    INSERT INTO extraction_equipment (company_id, name, equipment_type, capacity_grams, notes, status) VALUES
        (v_company_id, 'Harvest Right Large', 'freeze_dryer', 3500, 'Large pharmaceutical freeze dryer, 24-48h cycle', 'available'),
        (v_company_id, 'Harvest Right Medium', 'freeze_dryer', 2000, 'Medium freeze dryer, backup unit', 'available');

    -- Rosin presses
    INSERT INTO extraction_equipment (company_id, name, equipment_type, capacity_grams, notes, status) VALUES
        (v_company_id, 'Sasquash M2', 'rosin_press', 100, '12 ton press, 3x5" plates, PID temp control', 'available'),
        (v_company_id, 'Dabpress 10 Ton', 'rosin_press', 60, '10 ton press, 3x3" plates', 'available');

    -- Closed loop extractors
    INSERT INTO extraction_equipment (company_id, name, equipment_type, capacity_grams, notes, status) VALUES
        (v_company_id, 'BVV 5LB CLS', 'closed_loop_extractor', 2270, '5 lb material column, tri-clamp, 70/30 butane/propane blend', 'available'),
        (v_company_id, 'BVV 2LB CLS', 'closed_loop_extractor', 908, '2 lb material column, backup unit', 'maintenance');

    -- Vacuum ovens
    INSERT INTO extraction_equipment (company_id, name, equipment_type, capacity_grams, notes, status) VALUES
        (v_company_id, 'Cascade TEK 1.9CF', 'vacuum_oven', 2000, '1.9 cubic ft, digital PID, -30inHg capable', 'available'),
        (v_company_id, 'Across International 3.2CF', 'vacuum_oven', 4000, '3.2 cubic ft, 5 shelves, used for large purge batches', 'available');

    -- Cart fillers
    INSERT INTO extraction_equipment (company_id, name, equipment_type, capacity_grams, notes, status) VALUES
        (v_company_id, 'Thompson Duke S100', 'cart_filler', null, 'Semi-auto cart filler, 0.5g and 1g tips, heated reservoir', 'available');

    -- Filter press
    INSERT INTO extraction_equipment (company_id, name, equipment_type, capacity_grams, notes, status) VALUES
        (v_company_id, 'Buchner Funnel Set', 'filter_press', null, 'Vacuum filtration setup, 1000ml flask, various filter papers', 'available');

    -- Short path
    INSERT INTO extraction_equipment (company_id, name, equipment_type, capacity_grams, notes, status) VALUES
        (v_company_id, 'Summit 2L Short Path', 'short_path', 2000, '2 liter boiling flask, 2-stage vacuum, chiller to -40C', 'available');
END $$;
