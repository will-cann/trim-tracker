CREATE TABLE IF NOT EXISTS rate_limits (
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    request_count INT NOT NULL DEFAULT 0,
    window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (company_id, endpoint)
);
