-- Add 'cultivation' to the human_tasks category CHECK constraint
ALTER TABLE human_tasks DROP CONSTRAINT IF EXISTS human_tasks_category_check;
ALTER TABLE human_tasks ADD CONSTRAINT human_tasks_category_check
    CHECK (category IN (
        'drying_curing', 'ipm', 'compliance', 'equipment',
        'environmental', 'packaging', 'qc_testing', 'inventory',
        'transportation', 'sanitation', 'training',
        'trim', 'harvest', 'cultivation', 'other'
    ));
