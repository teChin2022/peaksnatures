-- ============================================================
-- 029: Date Change Requests
-- ============================================================

CREATE TABLE date_change_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id        UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  old_check_in      DATE NOT NULL,
  old_check_out     DATE NOT NULL,
  new_check_in      DATE NOT NULL,
  new_check_out     DATE NOT NULL,
  old_total_price   INTEGER NOT NULL,
  new_total_price   INTEGER NOT NULL,
  price_difference  INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_by      TEXT NOT NULL,
  slip_hash         TEXT,
  slip_trans_ref    TEXT,
  payment_slip_url  TEXT,
  easyslip_response JSONB,
  easyslip_verified BOOLEAN DEFAULT FALSE,
  reject_reason     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        TEXT NOT NULL DEFAULT 'guest',
  updated_by        TEXT NOT NULL DEFAULT 'guest'
);

CREATE INDEX idx_date_change_booking ON date_change_requests (booking_id);
CREATE INDEX idx_date_change_status ON date_change_requests (status);

ALTER TABLE date_change_requests ENABLE ROW LEVEL SECURITY;

-- Hosts can view date change requests for bookings at their homestays
CREATE POLICY "Hosts can view date change requests for own homestays"
  ON date_change_requests FOR SELECT
  USING (
    booking_id IN (
      SELECT b.id FROM bookings b
      WHERE b.homestay_id IN (
        SELECT h.id FROM homestays h
        WHERE h.host_id IN (
          SELECT ho.id FROM hosts ho WHERE ho.user_id = auth.uid()
        )
      )
    )
  );

-- Hosts can update date change requests (approve/reject) for their homestays
CREATE POLICY "Hosts can manage date change requests for own homestays"
  ON date_change_requests FOR UPDATE
  USING (
    booking_id IN (
      SELECT b.id FROM bookings b
      WHERE b.homestay_id IN (
        SELECT h.id FROM homestays h
        WHERE h.host_id IN (
          SELECT ho.id FROM hosts ho WHERE ho.user_id = auth.uid()
        )
      )
    )
  );

-- Anyone can insert a date change request (guest-initiated via service role, but allow for safety)
CREATE POLICY "Anyone can insert date change requests"
  ON date_change_requests FOR INSERT
  WITH CHECK (true);

CREATE TRIGGER trg_date_change_requests_updated_at
  BEFORE UPDATE ON date_change_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- RPC: approve_date_change_atomic
-- Atomically checks availability, updates booking, marks request approved.
-- ============================================================
CREATE OR REPLACE FUNCTION approve_date_change_atomic(
  p_request_id UUID,
  p_approved_by TEXT DEFAULT 'unknown'
) RETURNS BOOLEAN AS $$
DECLARE
  v_req RECORD;
  v_booking RECORD;
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

  -- Lock the room
  IF v_booking.room_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(v_booking.room_id::text));

    SELECT quantity INTO v_room_qty FROM rooms WHERE id = v_booking.room_id;
    IF v_room_qty IS NULL THEN
      RAISE EXCEPTION 'ROOM_NOT_FOUND';
    END IF;

    -- Check overlap (excluding current booking)
    SELECT COUNT(*) INTO v_overlap_count
    FROM bookings
    WHERE room_id = v_booking.room_id
      AND id != v_booking.id
      AND status IN ('pending', 'confirmed', 'verified')
      AND check_in < v_req.new_check_out
      AND check_out > v_req.new_check_in;

    IF v_overlap_count >= v_room_qty THEN
      RAISE EXCEPTION 'DATES_UNAVAILABLE';
    END IF;

    -- Check blocked dates
    SELECT COUNT(*) INTO v_blocked_count
    FROM blocked_dates
    WHERE homestay_id = v_booking.homestay_id
      AND date >= v_req.new_check_in
      AND date < v_req.new_check_out
      AND (room_id IS NULL OR room_id = v_booking.room_id);

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

  -- Update the booking
  UPDATE bookings
  SET check_in = v_req.new_check_in,
      check_out = v_req.new_check_out,
      total_price = v_req.new_total_price,
      amount_paid = v_new_amount_paid,
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
