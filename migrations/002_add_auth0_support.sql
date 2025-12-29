-- Migration: Add Auth0 support
-- Description: Adds external_id column to users table to store Auth0 'sub' strings.

ALTER TABLE users ADD COLUMN IF NOT EXISTS external_id VARCHAR(255) UNIQUE;

-- We can optionally seed the existing test users with dummy Auth0 IDs for local testing
UPDATE users SET external_id = 'auth0|admin' WHERE email = 'admin@greenvalley.com';
UPDATE users SET external_id = 'auth0|worker' WHERE email = 'worker@greenvalley.com';
UPDATE users SET external_id = 'auth0|summit_admin' WHERE email = 'admin@summitgardens.com';
