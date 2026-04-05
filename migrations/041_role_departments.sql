-- Add departments column to users and trimmer_profiles
ALTER TABLE users ADD COLUMN IF NOT EXISTS departments TEXT[] DEFAULT '{}';
ALTER TABLE trimmer_profiles ADD COLUMN IF NOT EXISTS departments TEXT[] DEFAULT '{}';

-- Migrate roles (admin stays as-is)
UPDATE users SET role = 'director' WHERE role = 'manager';
UPDATE users SET role = 'department_manager' WHERE role = 'lead';
UPDATE users SET role = 'technician' WHERE role = 'worker';

UPDATE trimmer_profiles SET role = 'director' WHERE role = 'manager';
UPDATE trimmer_profiles SET role = 'department_manager' WHERE role = 'lead';
UPDATE trimmer_profiles SET role = 'technician' WHERE role = 'worker';

-- Update CHECK constraints
-- users table: drop old, add new
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'director', 'department_manager', 'technician'));

-- trimmer_profiles table: drop old, add new
ALTER TABLE trimmer_profiles DROP CONSTRAINT IF EXISTS trimmer_profiles_role_check;
ALTER TABLE trimmer_profiles ADD CONSTRAINT trimmer_profiles_role_check CHECK (role IN ('admin', 'director', 'department_manager', 'technician'));
