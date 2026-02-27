-- Host assistants: allow hosts to invite assistants with restricted access
CREATE TABLE IF NOT EXISTS host_assistants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'revoked')),
  invited_at timestamptz DEFAULT now(),
  accepted_at timestamptz
);

-- One active/pending invitation per email per host
CREATE UNIQUE INDEX IF NOT EXISTS idx_host_assistants_host_email
  ON host_assistants(host_id, email) WHERE status IN ('pending', 'active');

-- Fast lookup: which host does this user assist?
CREATE INDEX IF NOT EXISTS idx_host_assistants_user_id
  ON host_assistants(user_id) WHERE status = 'active';

-- RLS
ALTER TABLE host_assistants ENABLE ROW LEVEL SECURITY;

-- Hosts can manage their own assistants
CREATE POLICY "Hosts can view own assistants"
  ON host_assistants FOR SELECT
  USING (
    host_id IN (SELECT id FROM hosts WHERE user_id = auth.uid())
    OR user_id = auth.uid()
  );

CREATE POLICY "Hosts can insert own assistants"
  ON host_assistants FOR INSERT
  WITH CHECK (
    host_id IN (SELECT id FROM hosts WHERE user_id = auth.uid())
  );

CREATE POLICY "Hosts can update own assistants"
  ON host_assistants FOR UPDATE
  USING (
    host_id IN (SELECT id FROM hosts WHERE user_id = auth.uid())
    OR user_id = auth.uid()
  );

CREATE POLICY "Hosts can delete own assistants"
  ON host_assistants FOR DELETE
  USING (
    host_id IN (SELECT id FROM hosts WHERE user_id = auth.uid())
  );

-- Service role full access
CREATE POLICY "Service role full access on host_assistants"
  ON host_assistants FOR ALL
  USING (auth.role() = 'service_role');

-- Allow assistants to read the host's data
CREATE POLICY "Assistants can view their linked host"
  ON hosts FOR SELECT
  USING (
    id IN (SELECT host_id FROM host_assistants WHERE user_id = auth.uid() AND status = 'active')
  );

-- Allow assistants to update non-sensitive host fields
CREATE POLICY "Assistants can update linked host"
  ON hosts FOR UPDATE
  USING (
    id IN (SELECT host_id FROM host_assistants WHERE user_id = auth.uid() AND status = 'active')
  );

-- Trigger: prevent assistants from modifying sensitive fields (promptpay_id, line_channel_access_token)
CREATE OR REPLACE FUNCTION prevent_assistant_sensitive_update()
RETURNS TRIGGER AS $$
BEGIN
  -- If the current user is NOT the host owner, block changes to sensitive fields
  IF NOT EXISTS (SELECT 1 FROM hosts WHERE id = NEW.id AND user_id = auth.uid()) THEN
    NEW.promptpay_id := OLD.promptpay_id;
    NEW.line_channel_access_token := OLD.line_channel_access_token;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_prevent_assistant_sensitive_update
  BEFORE UPDATE ON hosts
  FOR EACH ROW
  EXECUTE FUNCTION prevent_assistant_sensitive_update();

-- Allow assistants to read homestays for their linked host
CREATE POLICY "Assistants can view linked homestays"
  ON homestays FOR SELECT
  USING (
    host_id IN (SELECT host_id FROM host_assistants WHERE user_id = auth.uid() AND status = 'active')
  );

-- Allow assistants to read rooms for their linked homestay
CREATE POLICY "Assistants can view linked rooms"
  ON rooms FOR SELECT
  USING (
    homestay_id IN (
      SELECT id FROM homestays WHERE host_id IN (
        SELECT host_id FROM host_assistants WHERE user_id = auth.uid() AND status = 'active'
      )
    )
  );

-- Allow assistants to read bookings for their linked homestay
CREATE POLICY "Assistants can view linked bookings"
  ON bookings FOR SELECT
  USING (
    homestay_id IN (
      SELECT id FROM homestays WHERE host_id IN (
        SELECT host_id FROM host_assistants WHERE user_id = auth.uid() AND status = 'active'
      )
    )
  );

-- Allow assistants to update booking status (confirm/reject etc.)
CREATE POLICY "Assistants can update linked bookings"
  ON bookings FOR UPDATE
  USING (
    homestay_id IN (
      SELECT id FROM homestays WHERE host_id IN (
        SELECT host_id FROM host_assistants WHERE user_id = auth.uid() AND status = 'active'
      )
    )
  );

-- Allow assistants to read blocked dates
CREATE POLICY "Assistants can view linked blocked_dates"
  ON blocked_dates FOR SELECT
  USING (
    homestay_id IN (
      SELECT id FROM homestays WHERE host_id IN (
        SELECT host_id FROM host_assistants WHERE user_id = auth.uid() AND status = 'active'
      )
    )
  );

-- Allow assistants to manage blocked dates
CREATE POLICY "Assistants can manage linked blocked_dates"
  ON blocked_dates FOR INSERT
  WITH CHECK (
    homestay_id IN (
      SELECT id FROM homestays WHERE host_id IN (
        SELECT host_id FROM host_assistants WHERE user_id = auth.uid() AND status = 'active'
      )
    )
  );

CREATE POLICY "Assistants can delete linked blocked_dates"
  ON blocked_dates FOR DELETE
  USING (
    homestay_id IN (
      SELECT id FROM homestays WHERE host_id IN (
        SELECT host_id FROM host_assistants WHERE user_id = auth.uid() AND status = 'active'
      )
    )
  );
