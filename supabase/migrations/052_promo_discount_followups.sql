-- ============================================================
-- 052: Promo follow-ups
-- - Denormalize discount_amount onto bookings so commission, admin
--   revenue, date-change repricing, and host UIs don't need a
--   per-booking join into promo_redemptions.
-- - Extend create_booking_atomic with p_discount_amount.
-- - Recompute admin revenue on subtotal (GMV) so a promo doesn't
--   silently shrink the platform's reported revenue.
-- - Drop the host-side UPDATE policy on promo_redemptions; the
--   "mark as paid" action moves to a service-role API route that
--   validates ownership and only flips status pending → paid.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Denormalized discount_amount on bookings
-- ------------------------------------------------------------
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS discount_amount INTEGER NOT NULL DEFAULT 0
    CHECK (discount_amount >= 0);

-- ------------------------------------------------------------
-- 2. Extend create_booking_atomic with p_discount_amount.
--    Mirrors migration 050 verbatim and adds the new param + INSERT
--    column. Default 0 keeps existing callers working.
-- ------------------------------------------------------------
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
  p_booking_source TEXT DEFAULT 'guest',
  p_discount_amount INT DEFAULT 0
) RETURNS UUID AS $$
DECLARE
  v_booking_id UUID;
  v_room_qty INT;
  v_overlap_count INT;
  v_blocked BOOLEAN;
  v_phone TEXT := NULLIF(trim(p_guest_phone), '');
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_room_id::text));

  SELECT quantity INTO v_room_qty FROM rooms WHERE id = p_room_id;
  IF v_room_qty IS NULL THEN
    RAISE EXCEPTION 'ROOM_NOT_FOUND';
  END IF;

  SELECT COUNT(*) INTO v_overlap_count
  FROM bookings
  WHERE room_id = p_room_id
    AND status IN ('confirmed', 'pending', 'verified')
    AND check_in < p_check_out
    AND check_out > p_check_in;

  IF v_overlap_count >= v_room_qty THEN
    RAISE EXCEPTION 'DATES_UNAVAILABLE';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM blocked_dates
    WHERE (homestay_id = p_homestay_id AND room_id IS NULL AND date >= p_check_in AND date < p_check_out)
       OR (room_id = p_room_id AND date >= p_check_in AND date < p_check_out)
  ) INTO v_blocked;

  IF v_blocked THEN
    RAISE EXCEPTION 'DATES_BLOCKED';
  END IF;

  INSERT INTO bookings (
    homestay_id, room_id, guest_name, guest_email, guest_phone, guest_province,
    check_in, check_out, num_guests, total_price, status,
    easyslip_verified, payment_slip_hash, slip_trans_ref, payment_slip_url, easyslip_response,
    notes, payment_type, amount_paid, created_by, selected_options, booking_source,
    discount_amount
  ) VALUES (
    p_homestay_id, p_room_id, p_guest_name, p_guest_email, p_guest_phone, p_guest_province,
    p_check_in, p_check_out, p_num_guests, p_total_price, p_status,
    p_easyslip_verified, p_payment_slip_hash, p_slip_trans_ref, p_payment_slip_url, p_easyslip_response,
    p_notes, p_payment_type, p_amount_paid, p_created_by, p_selected_options, p_booking_source,
    GREATEST(0, p_discount_amount)
  ) RETURNING id INTO v_booking_id;

  IF p_session_id IS NOT NULL THEN
    DELETE FROM booking_holds WHERE session_id = p_session_id;
  END IF;

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

-- ------------------------------------------------------------
-- 3. Admin revenue uses GMV (subtotal) so promo discounts don't
--    silently shrink the platform's reported number.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admin_revenue_total()
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(total_price + COALESCE(discount_amount, 0)), 0)::BIGINT
  FROM bookings
  WHERE status IN ('confirmed', 'completed');
$$;

REVOKE ALL ON FUNCTION public.get_admin_revenue_total() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_revenue_total() TO service_role;

-- ------------------------------------------------------------
-- 4. Date-change requests carry a new_discount_amount so the approve
--    RPC can update bookings.discount_amount alongside total_price,
--    keeping (total_price + discount_amount) ≡ subtotal coherent
--    even when the new subtotal is smaller than the original
--    locked-in discount.
-- ------------------------------------------------------------
ALTER TABLE date_change_requests
  ADD COLUMN IF NOT EXISTS new_discount_amount INTEGER NOT NULL DEFAULT 0
    CHECK (new_discount_amount >= 0);

-- Extend approve_date_change_atomic to also update bookings.discount_amount
-- from the request row. Mirrors migration 030 verbatim, only the booking
-- UPDATE adds discount_amount.
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

  UPDATE date_change_requests
  SET status = 'approved',
      updated_by = p_approved_by
  WHERE id = p_request_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------
-- 5. Tighten promo_redemptions RLS: drop the host UPDATE policy.
--    The "mark as paid" flow moves to /api/host/promo-redemptions/[id]/mark-paid
--    which uses the service role and validates host ownership server-side.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Hosts can update payout status for own redemptions" ON promo_redemptions;
