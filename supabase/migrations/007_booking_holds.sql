-- Booking Holds: temporary date reservations to prevent race conditions
-- A hold is created when a user enters the payment step and expires after 5 minutes.

CREATE TABLE booking_holds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  session_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_booking_holds_room_id ON booking_holds(room_id);
CREATE INDEX idx_booking_holds_expires_at ON booking_holds(expires_at);
CREATE UNIQUE INDEX idx_booking_holds_session_room_dates
  ON booking_holds(room_id, session_id, check_in, check_out);

-- RLS: allow anyone to insert/select/delete holds (guests are anonymous)
ALTER TABLE booking_holds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can create a hold"
  ON booking_holds FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can view holds"
  ON booking_holds FOR SELECT USING (true);

CREATE POLICY "Anyone can delete holds"
  ON booking_holds FOR DELETE USING (true);

-- ============================================================
-- FUNCTION: acquire_booking_hold
-- Atomically checks availability (holds + bookings) and creates a hold.
-- Returns the hold ID on success, raises exception on conflict.
-- ============================================================
CREATE OR REPLACE FUNCTION acquire_booking_hold(
  p_room_id UUID,
  p_check_in DATE,
  p_check_out DATE,
  p_session_id TEXT,
  p_hold_minutes INT DEFAULT 5
) RETURNS UUID AS $$
DECLARE
  v_room_qty INT;
  v_active_count INT;
  v_hold_id UUID;
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
  INSERT INTO booking_holds (room_id, check_in, check_out, session_id, expires_at)
  VALUES (p_room_id, p_check_in, p_check_out, p_session_id, NOW() + (p_hold_minutes || ' minutes')::interval)
  ON CONFLICT (room_id, session_id, check_in, check_out)
  DO UPDATE SET expires_at = NOW() + (p_hold_minutes || ' minutes')::interval
  RETURNING id INTO v_hold_id;

  RETURN v_hold_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCTION: create_booking_atomic
-- Atomically checks availability and inserts a booking.
-- Deletes the session's hold on success. Safety net for race conditions.
-- ============================================================
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
  p_session_id TEXT DEFAULT NULL
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
    payment_slip_url, easyslip_response
  ) VALUES (
    p_homestay_id, p_room_id, p_guest_name, p_guest_email, p_guest_phone,
    p_guest_province, p_check_in, p_check_out, p_num_guests, p_total_price,
    p_status, p_easyslip_verified, p_payment_slip_hash, p_slip_trans_ref,
    p_payment_slip_url, p_easyslip_response
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
