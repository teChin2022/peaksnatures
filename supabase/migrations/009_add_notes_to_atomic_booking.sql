-- Add p_notes parameter to create_booking_atomic so guest notes are saved
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
  p_notes TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_room_qty INT;
  v_overlap_count INT;
  v_blocked_count INT;
  v_booking_id UUID;
BEGIN
  -- Serialize per room
  PERFORM pg_advisory_xact_lock(hashtext(p_room_id::text));

  -- Get room quantity
  SELECT quantity INTO v_room_qty FROM rooms WHERE id = p_room_id;
  IF v_room_qty IS NULL THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND';
  END IF;

  -- Count overlapping active bookings
  SELECT COUNT(*) INTO v_overlap_count
  FROM bookings
  WHERE room_id = p_room_id
    AND status IN ('pending', 'confirmed', 'verified')
    AND check_in < p_check_out
    AND check_out > p_check_in;

  IF v_overlap_count >= v_room_qty THEN
    RAISE EXCEPTION 'DATES_UNAVAILABLE';
  END IF;

  -- Check blocked dates
  SELECT COUNT(*) INTO v_blocked_count
  FROM blocked_dates
  WHERE homestay_id = p_homestay_id
    AND date >= p_check_in
    AND date < p_check_out;

  IF v_blocked_count > 0 THEN
    RAISE EXCEPTION 'DATES_BLOCKED';
  END IF;

  -- Insert booking
  INSERT INTO bookings (
    homestay_id, room_id, guest_name, guest_email, guest_phone,
    guest_province, check_in, check_out, num_guests, total_price,
    status, easyslip_verified, payment_slip_hash, slip_trans_ref,
    payment_slip_url, easyslip_response, notes
  ) VALUES (
    p_homestay_id, p_room_id, p_guest_name, p_guest_email, p_guest_phone,
    p_guest_province, p_check_in, p_check_out, p_num_guests, p_total_price,
    p_status, p_easyslip_verified, p_payment_slip_hash, p_slip_trans_ref,
    p_payment_slip_url, p_easyslip_response, p_notes
  ) RETURNING id INTO v_booking_id;

  -- Clean up the hold for this session
  IF p_session_id IS NOT NULL THEN
    DELETE FROM booking_holds
    WHERE room_id = p_room_id
      AND session_id = p_session_id
      AND check_in = p_check_in
      AND check_out = p_check_out;
  END IF;

  RETURN v_booking_id;
END;
$$ LANGUAGE plpgsql;
