-- Same-phone hold takeover: let a returning guest reclaim their own
-- orphaned booking_holds row from a previous browser session.
--
-- Failure mode being fixed: on mobile, a guest enters dates/details, sees
-- the PromptPay QR on step 3, switches to their banking app, and the tab
-- gets closed. They open the site fresh and retry. Because booking_holds
-- is keyed by session_id (a per-tab UUID), the new session sees the old
-- hold as "someone else's" and acquire_booking_hold rejects with
-- DATES_HELD for ~10 minutes.
--
-- Fix: store guest_phone on the hold and, before computing conflicts,
-- delete any overlapping holds owned by the same phone. Phone is already
-- collected on step 2 of the booking form, so it is available when the
-- hold is created.

-- 1) Add the phone column + a partial index for fast same-phone lookup.
ALTER TABLE booking_holds ADD COLUMN guest_phone TEXT;
CREATE INDEX idx_booking_holds_phone
  ON booking_holds(guest_phone) WHERE guest_phone IS NOT NULL;

-- 2) Drop the public SELECT policy. App code uses the service-role client
-- everywhere it reads holds, which bypasses RLS, so this policy is unused
-- and would otherwise expose phone numbers to anyone with the anon key.
DROP POLICY IF EXISTS "Anyone can view holds" ON booking_holds;

-- 3) Replace acquire_booking_hold to accept p_guest_phone and treat any
-- active hold with the same phone (any session_id) as "mine".
CREATE OR REPLACE FUNCTION acquire_booking_hold(
  p_room_id UUID,
  p_check_in DATE,
  p_check_out DATE,
  p_session_id TEXT,
  p_hold_minutes INT DEFAULT 5,
  p_guest_phone TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_room_qty INT;
  v_active_count INT;
  v_hold_id UUID;
  v_phone TEXT := NULLIF(trim(p_guest_phone), '');
BEGIN
  -- Serialize concurrent hold attempts for the same room
  PERFORM pg_advisory_xact_lock(hashtext(p_room_id::text));

  -- Get room quantity
  SELECT quantity INTO v_room_qty FROM rooms WHERE id = p_room_id;
  IF v_room_qty IS NULL THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND';
  END IF;

  -- Delete expired holds for this room (opportunistic cleanup)
  DELETE FROM booking_holds WHERE room_id = p_room_id AND expires_at <= NOW();

  -- Same-phone takeover: drop any overlapping holds owned by this phone
  -- before computing conflicts. This lets a returning guest reclaim their
  -- own orphaned hold from a previous browser session.
  IF v_phone IS NOT NULL THEN
    DELETE FROM booking_holds
    WHERE room_id = p_room_id
      AND guest_phone = v_phone
      AND check_in < p_check_out
      AND check_out > p_check_in;
  END IF;

  -- First check: confirmed bookings alone
  SELECT COUNT(*) INTO v_active_count
  FROM bookings
  WHERE room_id = p_room_id
    AND status IN ('pending', 'confirmed', 'verified')
    AND check_in < p_check_out
    AND check_out > p_check_in;

  IF v_active_count >= v_room_qty THEN
    RAISE EXCEPTION 'DATES_UNAVAILABLE';
  END IF;

  -- Second check: bookings + active holds from other sessions
  SELECT COUNT(*) INTO v_active_count FROM (
    SELECT id FROM booking_holds
    WHERE room_id = p_room_id
      AND expires_at > NOW()
      AND session_id != p_session_id
      AND check_in < p_check_out
      AND check_out > p_check_in
    UNION ALL
    SELECT id FROM bookings
    WHERE room_id = p_room_id
      AND status IN ('pending', 'confirmed', 'verified')
      AND check_in < p_check_out
      AND check_out > p_check_in
  ) AS active;

  IF v_active_count >= v_room_qty THEN
    RAISE EXCEPTION 'DATES_HELD';
  END IF;

  -- Upsert: create or refresh hold for this session
  INSERT INTO booking_holds (room_id, check_in, check_out, session_id, expires_at, guest_phone)
  VALUES (p_room_id, p_check_in, p_check_out, p_session_id, NOW() + (p_hold_minutes || ' minutes')::interval, v_phone)
  ON CONFLICT (room_id, session_id, check_in, check_out)
  DO UPDATE SET
    expires_at = NOW() + (p_hold_minutes || ' minutes')::interval,
    guest_phone = COALESCE(EXCLUDED.guest_phone, booking_holds.guest_phone)
  RETURNING id INTO v_hold_id;

  RETURN v_hold_id;
END;
$$ LANGUAGE plpgsql;
