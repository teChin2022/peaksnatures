-- ============================================================
-- ROLLBACK: Drop old policies and functions from the previous migration
-- ============================================================

-- Drop policies on host_assistants
DROP POLICY IF EXISTS "Hosts can view own assistants" ON host_assistants;
DROP POLICY IF EXISTS "Hosts can insert own assistants" ON host_assistants;
DROP POLICY IF EXISTS "Hosts can update own assistants" ON host_assistants;
DROP POLICY IF EXISTS "Hosts can delete own assistants" ON host_assistants;
DROP POLICY IF EXISTS "Service role full access on host_assistants" ON host_assistants;

-- Drop assistant policies on hosts
DROP POLICY IF EXISTS "Assistants can view their linked host" ON hosts;
DROP POLICY IF EXISTS "Assistants can update linked host" ON hosts;

-- Drop assistant policies on other tables
DROP POLICY IF EXISTS "Assistants can view linked homestays" ON homestays;
DROP POLICY IF EXISTS "Assistants can view linked rooms" ON rooms;
DROP POLICY IF EXISTS "Assistants can view linked bookings" ON bookings;
DROP POLICY IF EXISTS "Assistants can update linked bookings" ON bookings;
DROP POLICY IF EXISTS "Assistants can view linked blocked_dates" ON blocked_dates;
DROP POLICY IF EXISTS "Assistants can manage linked blocked_dates" ON blocked_dates;
DROP POLICY IF EXISTS "Assistants can delete linked blocked_dates" ON blocked_dates;

-- Drop old trigger + functions
DROP TRIGGER IF EXISTS trg_prevent_assistant_sensitive_update ON hosts;
DROP FUNCTION IF EXISTS prevent_assistant_sensitive_update();
DROP FUNCTION IF EXISTS get_host_ids_for_owner(uuid);
DROP FUNCTION IF EXISTS get_host_ids_for_assistant(uuid);
DROP FUNCTION IF EXISTS get_homestay_ids_for_hosts(uuid[]);

-- ============================================================
-- SECURITY DEFINER helpers to break circular RLS between
-- host_assistants <-> hosts. These bypass RLS on the target table.
-- ============================================================

-- Returns host IDs owned by a given user (bypasses hosts RLS)
CREATE OR REPLACE FUNCTION get_host_ids_for_owner(uid uuid)
RETURNS SETOF uuid AS $$
  SELECT id FROM hosts WHERE user_id = uid;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Returns host_id(s) where the user is an active assistant (bypasses host_assistants RLS)
CREATE OR REPLACE FUNCTION get_host_ids_for_assistant(uid uuid)
RETURNS SETOF uuid AS $$
  SELECT host_id FROM host_assistants WHERE user_id = uid AND status = 'active';
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Returns homestay IDs for a set of host IDs (bypasses homestays RLS)
CREATE OR REPLACE FUNCTION get_homestay_ids_for_hosts(host_ids uuid[])
RETURNS SETOF uuid AS $$
  SELECT id FROM homestays WHERE host_id = ANY(host_ids);
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- RLS on host_assistants (re-create)
-- ============================================================

CREATE POLICY "Hosts can view own assistants"
  ON host_assistants FOR SELECT
  USING (
    host_id IN (SELECT get_host_ids_for_owner(auth.uid()))
    OR user_id = auth.uid()
  );

CREATE POLICY "Hosts can insert own assistants"
  ON host_assistants FOR INSERT
  WITH CHECK (
    host_id IN (SELECT get_host_ids_for_owner(auth.uid()))
  );

CREATE POLICY "Hosts can update own assistants"
  ON host_assistants FOR UPDATE
  USING (
    host_id IN (SELECT get_host_ids_for_owner(auth.uid()))
    OR user_id = auth.uid()
  );

CREATE POLICY "Hosts can delete own assistants"
  ON host_assistants FOR DELETE
  USING (
    host_id IN (SELECT get_host_ids_for_owner(auth.uid()))
  );

CREATE POLICY "Service role full access on host_assistants"
  ON host_assistants FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- RLS policies on hosts — assistant access
-- ============================================================

CREATE POLICY "Assistants can view their linked host"
  ON hosts FOR SELECT
  USING (
    id IN (SELECT get_host_ids_for_assistant(auth.uid()))
  );

CREATE POLICY "Assistants can update linked host"
  ON hosts FOR UPDATE
  USING (
    id IN (SELECT get_host_ids_for_assistant(auth.uid()))
  );

-- Trigger: prevent assistants from modifying sensitive fields
CREATE OR REPLACE FUNCTION prevent_assistant_sensitive_update()
RETURNS TRIGGER AS $$
BEGIN
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

-- ============================================================
-- RLS policies on other tables — assistant access
-- ============================================================

CREATE POLICY "Assistants can view linked homestays"
  ON homestays FOR SELECT
  USING (
    host_id IN (SELECT get_host_ids_for_assistant(auth.uid()))
  );

CREATE POLICY "Assistants can view linked rooms"
  ON rooms FOR SELECT
  USING (
    homestay_id IN (
      SELECT get_homestay_ids_for_hosts(
        ARRAY(SELECT get_host_ids_for_assistant(auth.uid()))
      )
    )
  );

CREATE POLICY "Assistants can view linked bookings"
  ON bookings FOR SELECT
  USING (
    homestay_id IN (
      SELECT get_homestay_ids_for_hosts(
        ARRAY(SELECT get_host_ids_for_assistant(auth.uid()))
      )
    )
  );

CREATE POLICY "Assistants can update linked bookings"
  ON bookings FOR UPDATE
  USING (
    homestay_id IN (
      SELECT get_homestay_ids_for_hosts(
        ARRAY(SELECT get_host_ids_for_assistant(auth.uid()))
      )
    )
  );

CREATE POLICY "Assistants can view linked blocked_dates"
  ON blocked_dates FOR SELECT
  USING (
    homestay_id IN (
      SELECT get_homestay_ids_for_hosts(
        ARRAY(SELECT get_host_ids_for_assistant(auth.uid()))
      )
    )
  );

CREATE POLICY "Assistants can manage linked blocked_dates"
  ON blocked_dates FOR INSERT
  WITH CHECK (
    homestay_id IN (
      SELECT get_homestay_ids_for_hosts(
        ARRAY(SELECT get_host_ids_for_assistant(auth.uid()))
      )
    )
  );

CREATE POLICY "Assistants can delete linked blocked_dates"
  ON blocked_dates FOR DELETE
  USING (
    homestay_id IN (
      SELECT get_homestay_ids_for_hosts(
        ARRAY(SELECT get_host_ids_for_assistant(auth.uid()))
      )
    )
  );
