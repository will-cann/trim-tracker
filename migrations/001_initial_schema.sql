-- Trim Tracker MVP - Initial Database Schema
-- PostgreSQL Migration Script for Neon DB
-- Created: 2025-12-27

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- COMPANIES TABLE
-- ============================================================================
CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_companies_created_at ON companies(created_at);

-- ============================================================================
-- USERS TABLE
-- ============================================================================
CREATE TABLE users (
    id UUID PRIMARY KEY, -- Netlify Identity user ID (not auto-generated)
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255),
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'worker')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_users_company_id ON users(company_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- ============================================================================
-- TRIMMER PROFILES TABLE (Roster)
-- ============================================================================
CREATE TABLE trimmer_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_trimmer_profiles_company_id ON trimmer_profiles(company_id);
CREATE INDEX idx_trimmer_profiles_status ON trimmer_profiles(status);
CREATE INDEX idx_trimmer_profiles_company_status ON trimmer_profiles(company_id, status);

-- ============================================================================
-- TRIM SESSIONS TABLE
-- ============================================================================
CREATE TABLE trim_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES users(id),
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE,
    total_flower DECIMAL(10, 2) DEFAULT 0 CHECK (total_flower >= 0),
    total_shake DECIMAL(10, 2) DEFAULT 0 CHECK (total_shake >= 0),
    total_trim DECIMAL(10, 2) DEFAULT 0 CHECK (total_trim >= 0),
    total_waste DECIMAL(10, 2) DEFAULT 0 CHECK (total_waste >= 0),
    completed_at TIMESTAMP WITH TIME ZONE, -- NULL = active session, NOT NULL = completed
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_trim_sessions_company_id ON trim_sessions(company_id);
CREATE INDEX idx_trim_sessions_completed_at ON trim_sessions(completed_at);
CREATE INDEX idx_trim_sessions_created_by ON trim_sessions(created_by);
-- Critical composite index for reports with date range filtering
CREATE INDEX idx_trim_sessions_company_completed ON trim_sessions(company_id, completed_at) WHERE completed_at IS NOT NULL;
-- Index for finding active sessions
CREATE INDEX idx_trim_sessions_company_active ON trim_sessions(company_id, created_at) WHERE completed_at IS NULL;

-- ============================================================================
-- TRIM ENTRIES TABLE (Batches within sessions)
-- ============================================================================
CREATE TABLE trim_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES trim_sessions(id) ON DELETE CASCADE,
    harvest_name VARCHAR(255) NOT NULL,
    license_number VARCHAR(255) NOT NULL,
    strain VARCHAR(255) NOT NULL,
    start_weight DECIMAL(10, 2) NOT NULL CHECK (start_weight >= 0),
    flower_weight DECIMAL(10, 2) DEFAULT 0 CHECK (flower_weight >= 0),
    shake_weight DECIMAL(10, 2) DEFAULT 0 CHECK (shake_weight >= 0),
    trim_weight DECIMAL(10, 2) DEFAULT 0 CHECK (trim_weight >= 0),
    waste_weight DECIMAL(10, 2) DEFAULT 0 CHECK (waste_weight >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'submitted', 'upcoming')),
    planned_trim_date DATE,
    planned_method VARCHAR(20) CHECK (planned_method IN ('machine', 'scissors')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_trim_entries_session_id ON trim_entries(session_id);
CREATE INDEX idx_trim_entries_status ON trim_entries(status);
CREATE INDEX idx_trim_entries_strain ON trim_entries(strain);
CREATE INDEX idx_trim_entries_license ON trim_entries(license_number);

-- ============================================================================
-- TRIMMERS TABLE (Individual trimmer entries per batch)
-- ============================================================================
CREATE TABLE trimmers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_id UUID NOT NULL REFERENCES trim_entries(id) ON DELETE CASCADE,
    profile_id UUID REFERENCES trimmer_profiles(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME,
    tool VARCHAR(255),
    flower_weight DECIMAL(10, 2) DEFAULT 0 CHECK (flower_weight >= 0),
    shake_weight DECIMAL(10, 2) DEFAULT 0 CHECK (shake_weight >= 0),
    trim_weight DECIMAL(10, 2) DEFAULT 0 CHECK (trim_weight >= 0),
    waste_weight DECIMAL(10, 2) DEFAULT 0 CHECK (waste_weight >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_trimmers_entry_id ON trimmers(entry_id);
CREATE INDEX idx_trimmers_profile_id ON trimmers(profile_id);
CREATE INDEX idx_trimmers_name ON trimmers(name);

-- ============================================================================
-- TRIGGERS FOR UPDATED_AT TIMESTAMPS
-- ============================================================================

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables
CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON companies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_trimmer_profiles_updated_at BEFORE UPDATE ON trimmer_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_trim_sessions_updated_at BEFORE UPDATE ON trim_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_trim_entries_updated_at BEFORE UPDATE ON trim_entries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_trimmers_updated_at BEFORE UPDATE ON trimmers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE companies IS 'Top-level tenant entities - each company has isolated data';
COMMENT ON TABLE users IS 'User accounts linked to Netlify Identity - company_id enforces multi-tenancy';
COMMENT ON TABLE trimmer_profiles IS 'Roster of trimmers per company - reusable across sessions';
COMMENT ON TABLE trim_sessions IS 'Trim tracking sessions - active (completed_at IS NULL) or completed';
COMMENT ON TABLE trim_entries IS 'Batches within a session - tracks harvest/strain with status workflow';
COMMENT ON TABLE trimmers IS 'Individual trimmer work entries per batch - weights aggregate up';

COMMENT ON COLUMN users.id IS 'Netlify Identity user ID from JWT sub claim';
COMMENT ON COLUMN trim_sessions.completed_at IS 'NULL = active session, timestamp = completed/historical';
COMMENT ON COLUMN trim_entries.status IS 'Workflow: upcoming -> active -> submitted';
COMMENT ON COLUMN trimmers.start_time IS 'Time format HH:mm in local timezone';
COMMENT ON COLUMN trimmers.end_time IS 'Time format HH:mm in local timezone';

-- ============================================================================
-- SCHEMA VERSION TRACKING
-- ============================================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO schema_migrations (version) VALUES ('001_initial_schema');

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
