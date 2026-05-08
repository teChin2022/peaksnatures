-- Defense-in-depth hold cleanup on successful booking.
--
-- Background: migration 049 added same-phone takeover to acquire_booking_hold,
-- which lets a returning guest reclaim their own orphaned hold from a previous
-- browser session. The existing cleanup in create_booking_atomic only deletes
-- holds matching the booking's session_id, which can miss orphans in race /
-- takeover edge cases (e.g., Tab 1 acquires hold A, Tab 2 takes over with a
-- new hold B, Tab 2 then abandons while Tab 1 recovers and completes — the
-- session_id-only DELETE in create_booking_atomic matches nothing because
-- hold A was already deleted by Tab 2's takeover, and hold B survives).
--
-- Fix: when a booking completes, also delete any of this guest's overlapping
-- holds for the same room (matched by phone). This is symmetrical to the
-- takeover logic in acquire_booking_hold and safe because a successful
-- booking already proves the guest owns those dates.

CREATE OR REPLACE FUNCTION create_booking_atomic(
  p_homestay_id UUID,
  p_room_id UUID,
  p_guest_name TEXT,
  p_guest_email TEXT,
  p_guest_phone TEXT,
  p_guest_province TEXT,
  p_check_in DATE,
  p_check_out DATE,
  p_num_guests INT,
  p_total_price INT,
  p_status booking_status,
  p_easyslip_verified BOOLEAN,
  p_payment_slip_hash TEXT,
  p_slip_trans_ref TEXT,
  p_payment_slip_url TEXT,
  p_easyslip_response JSONB,
  p_session_id TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_payment_type TEXT DEFAULT 'full',
  p_amount_paid INT DEFAULT 0,
  p_created_by TEXT DEFAULT 'unknown',
  p_selected_options JSONB DEFAULT '[]',
  p_booking_source TEXT DEFAULT 'guest'
) RETURNS UUID AS $$
DECLARE
  v_booking_id UUID;
  v_room_qty INT;
  v_overlap_count INT;
  v_blocked BOOLEAN;
  v_phone TEXT := NULLIF(trim(p_guest_phone), '');
BEGIN
  -- Lock on the room to prevent concurrent bookings
  PERFORM pg_advisory_xact_lock(hashtext(p_room_id::text));

  -- Check room exists
  SELECT quantity INTO v_room_qty FROM rooms WHERE id = p_room_id;
  IF v_room_qty IS NULL THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND';
  END IF;

  -- Check for overlapping active bookings
  SELECT COUNT(*) INTO v_overlap_count
  FROM bookings
  WHERE room_id = p_room_id
    AND status IN ('confirmed', 'pending', 'verified')
    AND check_in < p_check_out
    AND check_out > p_check_in;

  IF v_overlap_count >= v_room_qty THEN
    RAISE EXCEPTION 'DATES_UNAVAILABLE';
  END IF;

  -- Check for blocked dates
  SELECT EXISTS (
    SELECT 1 FROM blocked_dates
    WHERE (homestay_id = p_homestay_id AND room_id IS NULL AND date >= p_check_in AND date < p_check_out)
       OR (room_id = p_room_id AND date >= p_check_in AND date < p_check_out)
  ) INTO v_blocked;

  IF v_blocked THEN
    RAISE EXCEPTION 'DATES_BLOCKED';
  END IF;

  -- Insert booking
  INSERT INTO bookings (
    homestay_id, room_id, guest_name, guest_email, guest_phone, guest_province,
    check_in, check_out, num_guests, total_price, status,
    easyslip_verified, payment_slip_hash, slip_trans_ref, payment_slip_url, easyslip_response,
    notes, payment_type, amount_paid, created_by, selected_options, booking_source
  ) VALUES (
    p_homestay_id, p_room_id, p_guest_name, p_guest_email, p_guest_phone, p_guest_province,
    p_check_in, p_check_out, p_num_guests, p_total_price, p_status,
    p_easyslip_verified, p_payment_slip_hash, p_slip_trans_ref, p_payment_slip_url, p_easyslip_response,
    p_notes, p_payment_type, p_amount_paid, p_created_by, p_selected_options, p_booking_source
  ) RETURNING id INTO v_booking_id;

  -- Existing cleanup: delete holds for this session
  IF p_session_id IS NOT NULL THEN
    DELETE FROM booking_holds WHERE session_id = p_session_id;
  END IF;

  -- NEW: also delete any of this guest's overlapping holds for this room,
  -- regardless of session_id. Catches orphans from takeover / race scenarios
  -- (see migration 049 for context).
  IF v_phone IS NOT NULL THEN
    DELETE FROM booking_holds
    WHERE room_id = p_room_id
      AND guest_phone = v_phone
      AND check_in < p_check_out
      AND check_out > p_check_in;
  END IF;

  RETURN v_booking_id;
END;
$$ LANGUAGE plpgsql;
