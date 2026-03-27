-- Migration 006: Human Tasks + Trimmer Profile → User Link
-- Moves task management to server-side, adds user attribution

-- ============================================================================
-- 1. Link trimmer_profiles to user accounts (nullable — profiles work without)
-- ============================================================================
ALTER TABLE trimmer_profiles
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_trimmer_profiles_user_id
    ON trimmer_profiles(user_id) WHERE user_id IS NOT NULL;

-- ============================================================================
-- 2. Human Tasks table
-- ============================================================================
CREATE TABLE IF NOT EXISTS human_tasks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

    -- Content
    title           VARCHAR(500) NOT NULL,
    description     TEXT,
    priority        VARCHAR(20) NOT NULL DEFAULT 'medium'
                        CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    category        VARCHAR(50) NOT NULL DEFAULT 'other'
                        CHECK (category IN (
                            'drying_curing', 'ipm', 'compliance', 'equipment',
                            'environmental', 'packaging', 'qc_testing', 'inventory',
                            'transportation', 'sanitation', 'training',
                            'trim', 'harvest', 'other'
                        )),
    status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'in_progress', 'completed')),

    -- Assignment & attribution
    assignee            VARCHAR(255),               -- Display name (fallback)
    assigned_to_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_by_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
    completed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Context
    location                VARCHAR(255),
    due_date                TIMESTAMP WITH TIME ZONE,
    source_conversation_id  VARCHAR(255),

    -- Timestamps
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at    TIMESTAMP WITH TIME ZONE
);

-- Triggers
CREATE TRIGGER update_human_tasks_updated_at
    BEFORE UPDATE ON human_tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Indexes
CREATE INDEX idx_human_tasks_company_id ON human_tasks(company_id);
CREATE INDEX idx_human_tasks_status ON human_tasks(company_id, status);
CREATE INDEX idx_human_tasks_category ON human_tasks(company_id, category);
CREATE INDEX idx_human_tasks_priority ON human_tasks(company_id, priority);
CREATE INDEX idx_human_tasks_assigned_to ON human_tasks(assigned_to_user_id) WHERE assigned_to_user_id IS NOT NULL;
CREATE INDEX idx_human_tasks_created_by ON human_tasks(created_by_user_id) WHERE created_by_user_id IS NOT NULL;
CREATE INDEX idx_human_tasks_due_date ON human_tasks(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX idx_human_tasks_created_at ON human_tasks(company_id, created_at);
