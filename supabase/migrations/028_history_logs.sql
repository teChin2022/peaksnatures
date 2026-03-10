-- ************************************************************
-- 028: History Logs
-- Append-only audit/event log for tracking all significant
-- actions across the platform.
-- ************************************************************

CREATE TABLE history_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  homestay_id UUID REFERENCES homestays(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  event_type  TEXT NOT NULL,
  actor_type  TEXT NOT NULL CHECK (actor_type IN ('guest', 'host', 'admin', 'system')),
  actor_id    TEXT,
  data        JSONB DEFAULT '{}',
  ip_address  INET,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX idx_history_entity ON history_logs (entity_type, entity_id);
CREATE INDEX idx_history_homestay ON history_logs (homestay_id);
CREATE INDEX idx_history_created ON history_logs (created_at);
CREATE INDEX idx_history_event ON history_logs (event_type);

-- Prevent UPDATE and DELETE on history_logs (append-only)
CREATE OR REPLACE FUNCTION prevent_history_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'history_logs is append-only: % not allowed', TG_OP;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_history_logs_no_update
  BEFORE UPDATE ON history_logs FOR EACH ROW
  EXECUTE FUNCTION prevent_history_log_mutation();

CREATE TRIGGER trg_history_logs_no_delete
  BEFORE DELETE ON history_logs FOR EACH ROW
  EXECUTE FUNCTION prevent_history_log_mutation();
