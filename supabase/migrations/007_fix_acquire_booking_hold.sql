-- Fix: Split DATES_HELD into DATES_UNAVAILABLE vs DATES_HELD
-- Run this AFTER 007_booking_holds.sql has already been applied.
-- This replaces the acquire_booking_hold function only.

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
