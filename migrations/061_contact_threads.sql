-- Contact threads and messages — channel-agnostic (email now, SMS later).
-- Writes come from the inbound ingest and outbound send functions (sibling units).

CREATE TABLE IF NOT EXISTS contact_threads (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    vendor_id uuid REFERENCES vendors(id) ON DELETE SET NULL,
    channel text NOT NULL CHECK (channel IN ('email','sms')),
    subject text,
    status text NOT NULL DEFAULT 'open',
    last_activity_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_threads_company ON contact_threads (company_id, vendor_id);
CREATE INDEX IF NOT EXISTS idx_contact_threads_activity ON contact_threads (company_id, last_activity_at DESC);

CREATE TABLE IF NOT EXISTS contact_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id uuid NOT NULL REFERENCES contact_threads(id) ON DELETE CASCADE,
    company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    channel text NOT NULL CHECK (channel IN ('email','sms')),
    direction text NOT NULL CHECK (direction IN ('outbound','inbound')),
    from_address text NOT NULL,
    to_address text NOT NULL,
    subject text,
    body_text text NOT NULL,
    body_html text,
    raw_headers jsonb,
    message_id_header text,
    in_reply_to_header text,
    provider_event_id text,
    sent_at timestamptz,
    received_at timestamptz,
    parsed_as jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_messages_thread ON contact_messages (thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_contact_messages_msgid ON contact_messages (channel, message_id_header) WHERE message_id_header IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contact_messages_reply ON contact_messages (channel, in_reply_to_header) WHERE in_reply_to_header IS NOT NULL;
