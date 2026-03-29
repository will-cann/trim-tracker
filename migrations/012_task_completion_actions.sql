-- Migration 012: Task Completion Actions
-- Adds a JSONB column to human_tasks that stores a system action to execute
-- when the task is marked as completed (e.g. "Cut 50 clones" → create_planting on complete)

ALTER TABLE human_tasks
    ADD COLUMN IF NOT EXISTS on_complete_action JSONB;

COMMENT ON COLUMN human_tasks.on_complete_action IS
    'Optional ProposedAction (type + data) to execute when task is marked completed. NULL means no linked action.';
