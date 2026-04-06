-- Fix: drop old CHECK constraints first, then migrate remaining data, then add new constraints

-- Drop old constraints (may already be dropped from partial 041 run)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE trimmer_profiles DROP CONSTRAINT IF EXISTS trimmer_profiles_role_check;

-- Migrate any remaining old role values
UPDATE users SET role = 'director' WHERE role = 'manager';
UPDATE users SET role = 'department_manager' WHERE role = 'lead';
UPDATE users SET role = 'technician' WHERE role = 'worker';

UPDATE trimmer_profiles SET role = 'director' WHERE role = 'manager';
UPDATE trimmer_profiles SET role = 'department_manager' WHERE role = 'lead';
UPDATE trimmer_profiles SET role = 'technician' WHERE role = 'worker';

-- Add new constraints
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'director', 'department_manager', 'technician'));
ALTER TABLE trimmer_profiles ADD CONSTRAINT trimmer_profiles_role_check CHECK (role IN ('admin', 'director', 'department_manager', 'technician'));
