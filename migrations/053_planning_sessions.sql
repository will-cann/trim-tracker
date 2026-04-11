-- 053: Planning Sessions
--
-- Persists multi-target demand-backward plans so operators can build up a
-- weekly production plan ("1000 g rosin × 5 strains + 1000 rosin carts"),
-- save it, reopen it, and later convert its stages into extraction runs.
--
-- Targets and the computed plan are both stored as JSONB — the plan is a
-- snapshot, not a live projection. Reopening a session shows the plan as it
-- was when saved; recomputing is an explicit user action.

CREATE TABLE IF NOT EXISTS planning_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    targets JSONB NOT NULL DEFAULT '[]'::jsonb,
    plan JSONB,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'archived')),
    notes TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_planning_sessions_company
    ON planning_sessions(company_id, status, updated_at DESC);

-- Back-reference on runs: which planning session a run was spawned from.
-- Nullable — runs created directly from the Runs tab have no session.
ALTER TABLE extraction_runs
    ADD COLUMN IF NOT EXISTS source_planning_session_id UUID
        REFERENCES planning_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_extraction_runs_planning_session
    ON extraction_runs(source_planning_session_id)
    WHERE source_planning_session_id IS NOT NULL;
