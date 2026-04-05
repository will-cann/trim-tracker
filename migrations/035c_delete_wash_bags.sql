-- Remove wash bags from supply items — they're durable equipment, not consumables
DELETE FROM supply_items WHERE name LIKE '%Wash Bags%';
