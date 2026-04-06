CREATE TABLE saved_task_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  created_by UUID NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  spec JSONB NOT NULL,
  pinned BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_saved_task_views_company ON saved_task_views(company_id);

CREATE TRIGGER set_saved_task_views_updated_at
  BEFORE UPDATE ON saved_task_views
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
