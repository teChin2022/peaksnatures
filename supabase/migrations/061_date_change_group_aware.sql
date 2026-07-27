-- ============================================================
-- 061: Make approve_date_change_atomic group-aware.
-- Date/room changes happen per member booking (each room is a normal
-- bookings row). The single-room path is unchanged. The only fix
-- needed for grouped bookings: after updating the member row, keep
-- the booking_groups parent + the group-keyed promo redemption
-- coherent by re-summing the member rows.
--
-- Mirrors 052 verbatim and only adds the trailing group-reconcile
-- block (guarded by v_booking.group_id IS NOT NULL).
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
  SELECT * INTO v_req FROM date_change_requests WHERE id = p_request_id AND status = 'pending';
  IF v_req IS NULL THEN
    RAISE EXCEPTION 'REQUEST_NOT_FOUND';
  END IF;

  SELECT * INTO v_booking FROM bookings WHERE id = v_req.booking_id;
  IF v_booking IS NULL THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND';
  END IF;

  v_target_room_id := COALESCE(v_req.new_room_id, v_booking.room_id);

  IF v_target_room_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(v_target_room_id::text));

    IF v_req.new_room_id IS NOT NULL AND v_req.new_room_id != v_booking.room_id THEN
      PERFORM pg_advisory_xact_lock(hashtext(v_booking.room_id::text));
    END IF;

    SELECT quantity INTO v_room_qty FROM rooms WHERE id = v_target_room_id;
    IF v_room_qty IS NULL THEN
      RAISE EXCEPTION 'ROOM_NOT_FOUND';
    END IF;

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

  v_new_amount_paid := v_booking.amount_paid;
  IF v_req.price_difference > 0 AND v_req.easyslip_verified THEN
    v_new_amount_paid := v_booking.amount_paid + v_req.price_difference;
  END IF;
  IF v_new_amount_paid > v_req.new_total_price THEN
    v_new_amount_paid := v_req.new_total_price;
  END IF;

  UPDATE bookings
  SET check_in = v_req.new_check_in,
      check_out = v_req.new_check_out,
      total_price = v_req.new_total_price,
      discount_amount = COALESCE(v_req.new_discount_amount, 0),
      amount_paid = v_new_amount_paid,
      room_id = v_target_room_id,
      updated_by = p_approved_by
  WHERE id = v_booking.id;

  -- Keep promo_redemptions.discount_amount in sync if a redemption exists.
  -- Commission stays locked at its original value (host's deal with the recommender
  -- doesn't change just because the guest moved their dates).
  UPDATE promo_redemptions
  SET discount_amount = COALESCE(v_req.new_discount_amount, 0),
      updated_by = p_approved_by
  WHERE booking_id = v_booking.id;

  -- ---- Group reconcile (multi-room cart) -------------------------------
  -- For a grouped booking, the member row above just changed, so re-sum the
  -- member rows into the booking_groups parent and the group-keyed redemption.
  -- Single-room bookings (group_id IS NULL) skip this entirely.
  IF v_booking.group_id IS NOT NULL THEN
    UPDATE booking_groups g
    SET total_price = sums.total_price,
        discount_amount = sums.discount_amount,
        amount_paid = sums.amount_paid,
        updated_by = p_approved_by
    FROM (
      SELECT COALESCE(SUM(total_price), 0)     AS total_price,
             COALESCE(SUM(discount_amount), 0) AS discount_amount,
             COALESCE(SUM(amount_paid), 0)     AS amount_paid
      FROM bookings
      WHERE group_id = v_booking.group_id
    ) sums
    WHERE g.id = v_booking.group_id;

    UPDATE promo_redemptions
    SET discount_amount = (
          SELECT COALESCE(SUM(discount_amount), 0)
          FROM bookings
          WHERE group_id = v_booking.group_id
        ),
        updated_by = p_approved_by
    WHERE group_id = v_booking.group_id;
  END IF;
  -- ---------------------------------------------------------------------

  UPDATE date_change_requests
  SET status = 'approved',
      updated_by = p_approved_by
  WHERE id = p_request_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;
