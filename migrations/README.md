# Database Migrations

This directory contains PostgreSQL migration scripts for the Trim Tracker MVP application.

## Prerequisites

- Neon PostgreSQL database (or any PostgreSQL 14+ database)
- `psql` command-line tool installed
- Database connection string from Neon

## Running Migrations

### Step 1: Set Your Database Connection

```bash
export DATABASE_URL="postgresql://username:password@your-neon-host/database?sslmode=require"
```

Or create a `.env` file in the project root:
```env
NEON_DATABASE_URL=postgresql://username:password@your-neon-host/database?sslmode=require
```

### Step 2: Run the Initial Schema Migration

```bash
psql $DATABASE_URL -f migrations/001_initial_schema.sql
```

Or if using the connection string directly:
```bash
psql "postgresql://username:password@your-neon-host/database?sslmode=require" -f migrations/001_initial_schema.sql
```

### Step 3: (Optional) Seed Development Data

**WARNING**: Only run this in development/testing environments, NOT in production!

```bash
psql $DATABASE_URL -f migrations/seed_dev_data.sql
```

## Verify Schema

Connect to your database and verify tables were created:

```bash
psql $DATABASE_URL
```

Then run:
```sql
-- List all tables
\dt

-- Describe specific tables
\d+ companies
\d+ users
\d+ trim_sessions
\d+ trim_entries
\d+ trimmers
\d+ trimmer_profiles

-- Check indexes
\di

-- View schema version
SELECT * FROM schema_migrations;
```

## Schema Overview

The database schema includes the following tables:

### Core Tables

1. **companies** - Top-level tenant entities for multi-tenancy
2. **users** - User accounts linked to Netlify Identity with company_id
3. **trimmer_profiles** - Roster of trimmers per company (reusable across sessions)
4. **trim_sessions** - Trim tracking sessions (active or completed)
5. **trim_entries** - Batches within a session (tracks harvest/strain)
6. **trimmers** - Individual trimmer work entries per batch

### Relationships

```
companies (1:N) → users
companies (1:N) → trimmer_profiles
companies (1:N) → trim_sessions

trim_sessions (1:N) → trim_entries
trim_entries (1:N) → trimmers

trimmers (N:1) → trimmer_profiles [optional reference]
```

### Key Features

- **Multi-tenancy**: All data is scoped by `company_id`
- **Cascading Deletes**: Deleting a company removes all related data
- **Auto-timestamps**: `created_at` and `updated_at` managed by triggers
- **Constraints**: CHECK constraints on enums and positive numbers
- **Indexes**: Optimized for common queries (company lookups, date ranges, reports)

## Seed Data Summary

The seed data includes:

- **2 Companies**: Green Valley Cultivation, Summit Gardens
- **3 Users**: 2 admins, 1 worker
- **6 Trimmer Profiles**: 4 for Green Valley, 2 for Summit Gardens
- **4 Trim Sessions**: 3 completed (historical), 1 active (in-progress)
- **6 Trim Entries**: Various strains and statuses
- **9 Trimmer Work Records**: With realistic weights and times

### Test Users

| Email | Password | Company | Role |
|-------|----------|---------|------|
| admin@greenvalley.com | (Set in Netlify Identity) | Green Valley Cultivation | admin |
| worker@greenvalley.com | (Set in Netlify Identity) | Green Valley Cultivation | worker |
| admin@summitgardens.com | (Set in Netlify Identity) | Summit Gardens | admin |

**Note**: User IDs in the seed data are placeholders. When integrating with Netlify Identity, you'll need to update these UUIDs to match actual Netlify user IDs.

## Rollback

To completely reset the database:

```sql
-- Drop all tables in reverse dependency order
DROP TABLE IF EXISTS trimmers CASCADE;
DROP TABLE IF EXISTS trim_entries CASCADE;
DROP TABLE IF EXISTS trim_sessions CASCADE;
DROP TABLE IF EXISTS trimmer_profiles CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS companies CASCADE;
DROP TABLE IF EXISTS schema_migrations CASCADE;

-- Drop the trigger function
DROP FUNCTION IF EXISTS update_updated_at_column CASCADE;

-- Drop extensions
DROP EXTENSION IF EXISTS "pgcrypto";
DROP EXTENSION IF EXISTS "uuid-ossp";
```

Then re-run the migration scripts.

## Next Steps

After running migrations:

1. Update `.env` file with your `NEON_DATABASE_URL`
2. Configure Netlify Functions to use the database connection
3. Set up Netlify Identity for user authentication
4. Test database connectivity from Netlify Functions
5. Deploy the application

## Troubleshooting

### Connection refused
- Verify your Neon database is running
- Check that IP allowlist includes your IP (or set to 0.0.0.0/0 for testing)
- Ensure SSL mode is configured correctly

### Permission denied
- Verify your database user has CREATE permissions
- Check that you're using the correct credentials

### Table already exists
- Tables may have been created previously
- Run the rollback script above to start fresh
- Or manually drop conflicting tables

## Support

For issues with Neon PostgreSQL, see: https://neon.tech/docs
For Netlify Functions, see: https://docs.netlify.com/functions/overview/
