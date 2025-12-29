# CLAUDE.md

This file provides guidance to Claude Code when working with the Trim Tracker MVP project.

## Project Overview

Trim Tracker MVP is a cannabis trim tracking application for managing trimmer productivity and trim sessions across multiple facilities.

**Stack:**
- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS
- **Database:** PostgreSQL (Neon DB)
- **Authentication:** Netlify Identity (planned)
- **Deployment:** Netlify

## Current Implementation Status

### ✅ Database - Mostly Complete

**PostgreSQL Schema:** Fully implemented in `migrations/001_initial_schema.sql` (created 2025-12-27)

**Key Tables:**
1. **companies** - Multi-tenant root entities (UUID PK, with timestamps)
2. **users** - User accounts with Netlify Identity integration (UUID PK, company_id FK, role enum: admin/worker)
3. **trimmer_profiles** - Roster of trimmers per company (reusable across sessions)
4. **trim_sessions** - Active or completed trim tracking sessions
5. **trim_entries** - Batches within sessions (tracks harvest/strain with status workflow)
6. **trimmers** - Individual trimmer work entries per batch

**Schema Features:**
- Multi-tenancy via company_id on all tables
- Cascading deletes for data integrity
- Auto-timestamps with PostgreSQL triggers (updated_at function)
- UUID extensions enabled
- Comprehensive indexing for performance
- CHECK constraints on enums and positive numbers
- Status workflows: `upcoming` → `active` → `submitted`
- Seed data included for 2 companies with test users and trimmer profiles

**Seed Data:** `migrations/seed_dev_data.sql`
- 2 Companies: Green Valley Cultivation, Summit Gardens
- 3 Test Users with roles (admin/worker)
- 6 Trimmer Profiles
- 4 Trim Sessions (historical + active)

**What's Missing:**
- Backend API layer to connect to the database (no Netlify Functions yet)
- Frontend currently uses mock data (localStorage + IndexedDB via Dexie)

### ❌ Authentication - Not Started

**Planned Architecture:**
- **Provider:** Netlify Identity (OAuth/JWT-based)
- **User ID Source:** JWT `sub` claim from Netlify
- **Database User Table:** Already prepared with UUID id field for Netlify user ID

**What's Missing:**
1. No actual Netlify Identity integration in frontend
2. No authentication middleware/guard
3. No login/logout flows in UI
4. No JWT token handling
5. No auth context or provider setup
6. No protected routes
7. No role-based access control enforcement

**Current Workaround:**
- Frontend uses mock API (`src/services/mockApi.ts`) that stores data in:
  - localStorage (active sessions)
  - IndexedDB via Dexie (completed sessions, trimmer profiles)

### Frontend Architecture

**Location:** `src/`
- **Database Layer:** Dexie (IndexedDB ORM) at `src/services/db.ts`
- **Mock API:** `src/services/mockApi.ts`
- **Seed Data:** `src/services/seedData.ts`

**Components:**
- Dashboard for active trim tracking
- Reports dashboard for analytics
- Sidebar with trimmer roster management
- Modal components for batch and profile management

## Development Commands

```bash
npm install          # Install dependencies
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build
npm run lint         # Run ESLint
npm run typecheck    # TypeScript validation
```

## Database Deployment

**To Deploy Schema:**
1. Set DATABASE_URL environment variable pointing to Neon PostgreSQL
2. Run: `psql $DATABASE_URL -f migrations/001_initial_schema.sql`
3. (Optional) Seed test data: `psql $DATABASE_URL -f migrations/seed_dev_data.sql`
4. Update .env with NEON_DATABASE_URL
5. Configure Netlify Functions to use database connection

**Migration Documentation:** See `migrations/README.md` for comprehensive instructions

## Next Steps Priority

1. **Create Netlify Functions** - API endpoints to connect frontend to PostgreSQL
2. **Implement Netlify Identity** - Add authentication flows and JWT verification
3. **Replace Mock API** - Swap `mockApi.ts` calls with real database queries
4. **Add Auth Guards** - Protect routes based on user roles (admin/worker)
5. **Multi-tenancy Enforcement** - Ensure company-scoped data access in all queries

## Business Domain Context

This application tracks cannabis trimming operations, managing:
- Trimmer productivity metrics (grams trimmed per hour)
- Batch tracking with harvest and strain information
- Multi-session management (active and historical)
- Company-level trimmer rosters
- Analytics and reporting dashboards

The platform supports multi-tenant operations where each company has isolated data and user access.
