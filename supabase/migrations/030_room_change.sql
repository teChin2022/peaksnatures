-- ============================================================
-- 030: Room Change Support for Date Change Requests
-- ============================================================

-- Add room columns to date_change_requests
ALTER TABLE date_change_requests
  ADD COLUMN old_room_id UUID REFERENCES rooms(id),
  ADD COLUMN new_room_id UUID REFERENCES rooms(id);

-- Backfill: set old_room_id from the booking's current room_id
UPDATE date_change_requests dcr
SET old_room_id = b.room_id,
    new_room_id = b.room_id
FROM bookings b
WHERE dcr.booking_id = b.id;

-- ============================================================
-- Updated RPC: approve_date_change_atomic
-- Now supports room changes: checks availability on the NEW room,
-- and updates booking.room_id when room is changed.
-- ============================================================
CREATE OR REPLACE FUNCTION approve_date_change_atomic(
  p_request_id UUID,
  p_approved_by TEXT DEFAULT 'unknown'
) RETURNS BOOLEAN AS $$
DECLARE
  v_req RECORD;
  v_booking RECORD;
  v_target_room_id UUID;
  v_room_qty INT;
  v_overlap_count INT;
  v_blocked_count INT;
  v_new_amount_paid INT;
BEGIN
  -- Fetch the request
  SELECT * INTO v_req FROM date_change_requests WHERE id = p_request_id AND status = 'pending';
  IF v_req IS NULL THEN
    RAISE EXCEPTION 'REQUEST_NOT_FOUND';
  END IF;

  -- Fetch the booking
  SELECT * INTO v_booking FROM bookings WHERE id = v_req.booking_id;
  IF v_booking IS NULL THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND';
  END IF;

  -- Determine the target room (new_room_id if set, otherwise booking's current room)
  v_target_room_id := COALESCE(v_req.new_room_id, v_booking.room_id);

  -- Lock the target room
  IF v_target_room_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(v_target_room_id::text));

    -- If room is changing, also lock the old room
    IF v_req.new_room_id IS NOT NULL AND v_req.new_room_id != v_booking.room_id THEN
      PERFORM pg_advisory_xact_lock(hashtext(v_booking.room_id::text));
    END IF;

    SELECT quantity INTO v_room_qty FROM rooms WHERE id = v_target_room_id;
    IF v_room_qty IS NULL THEN
      RAISE EXCEPTION 'ROOM_NOT_FOUND';
    END IF;

    -- Check overlap on TARGET room (excluding current booking)
    SELECT COUNT(*) INTO v_overlap_count
    FROM bookings
    WHERE room_id = v_target_room_id
      AND id != v_booking.id
      AND status IN ('pending', 'confirmed', 'verified')
      AND check_in < v_req.new_check_out
      AND check_out > v_req.new_check_in;

    IF v_overlap_count >= v_room_qty THEN
      RAISE EXCEPTION 'DATES_UNAVAILABLE';
    END IF;

    -- Check blocked dates on TARGET room
    SELECT COUNT(*) INTO v_blocked_count
    FROM blocked_dates
    WHERE homestay_id = v_booking.homestay_id
      AND date >= v_req.new_check_in
      AND date < v_req.new_check_out
      AND (room_id IS NULL OR room_id = v_target_room_id);

    IF v_blocked_count > 0 THEN
      RAISE EXCEPTION 'DATES_BLOCKED';
    END IF;
  END IF;

  -- Calculate new amount_paid
  v_new_amount_paid := v_booking.amount_paid;
  IF v_req.price_difference > 0 AND v_req.easyslip_verified THEN
    v_new_amount_paid := v_booking.amount_paid + v_req.price_difference;
  END IF;
  -- Cap amount_paid to new_total_price (handles price decrease)
  IF v_new_amount_paid > v_req.new_total_price THEN
    v_new_amount_paid := v_req.new_total_price;
  END IF;

  -- Update the booking (including room_id if changed)
  UPDATE bookings
  SET check_in = v_req.new_check_in,
      check_out = v_req.new_check_out,
      total_price = v_req.new_total_price,
      amount_paid = v_new_amount_paid,
      room_id = v_target_room_id,
      updated_by = p_approved_by
  WHERE id = v_booking.id;

  -- Mark request as approved
  UPDATE date_change_requests
  SET status = 'approved',
      updated_by = p_approved_by
  WHERE id = p_request_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;
