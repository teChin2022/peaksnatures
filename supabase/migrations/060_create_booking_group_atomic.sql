-- ============================================================
-- 060: create_booking_group_atomic
-- All-or-nothing creation of a multi-room cart. Mirrors
-- create_booking_atomic (052) but for N rooms sharing one
-- booking_groups parent + one slip/payment.
--
-- Atomicity: every room is locked (sorted, same hashtext lock space
-- as the single-room RPC + holds → no deadlock); each item re-checks
-- overlap-vs-quantity and blocked_dates; any RAISE rolls back the
-- whole transaction. Same-room-twice / quantity is handled for free
-- because item k+1's COUNT sees item k's just-inserted row in-txn.
--
-- p_items: JSONB array, one element per room, each:
--   { room_id, check_in, check_out, num_guests,
--     total_price, discount_amount, amount_paid,
--     selected_options, guest_pricing_label, guest_pricing_surcharge }
-- Money shares are computed + price-verified by the API route; this
-- RPC trusts them (same posture as create_booking_atomic) and only
-- enforces availability.
-- ============================================================

CREATE OR REPLACE FUNCTION create_booking_group_atomic(
  p_homestay_id UUID,
  p_guest_name TEXT,
  p_guest_email TEXT,
  p_guest_phone TEXT,
  p_guest_province TEXT,
  p_notes TEXT,
  p_status booking_status,
  p_easyslip_verified BOOLEAN,
  p_payment_slip_hash TEXT,
  p_slip_trans_ref TEXT,
  p_payment_slip_url TEXT,
  p_easyslip_response JSONB,
  p_payment_type TEXT,
  p_amount_paid INT,
  p_total_price INT,
  p_discount_amount INT,
  p_session_id TEXT,
  p_created_by TEXT,
  p_booking_source TEXT,
  p_items JSONB
) RETURNS UUID AS $$
DECLARE
  v_group_id UUID;
  v_room UUID;
  v_item JSONB;
  v_room_qty INT;
  v_overlap_count INT;
  v_blocked BOOLEAN;
  v_phone TEXT := NULLIF(trim(p_guest_phone), '');
BEGIN
  -- 1) Lock every distinct room, in sorted order → deadlock-free.
  FOR v_room IN
    SELECT DISTINCT (e->>'room_id')::uuid AS rid
    FROM jsonb_array_elements(p_items) e
    ORDER BY rid
  LOOP
    PERFORM pg_advisory_xact_lock(hashtext(v_room::text));
  END LOOP;

  -- 2) Create the shared parent (canonical slip + combined money).
  INSERT INTO booking_groups (
    homestay_id, guest_name, guest_email, guest_phone, guest_province, notes,
    total_price, discount_amount, payment_type, amount_paid, status,
    easyslip_verified, payment_slip_url, payment_slip_hash, slip_trans_ref, easyslip_response,
    booking_source, created_by, updated_by
  ) VALUES (
    p_homestay_id, p_guest_name, p_guest_email, p_guest_phone, p_guest_province, p_notes,
    p_total_price, GREATEST(0, p_discount_amount), p_payment_type, p_amount_paid, p_status,
    p_easyslip_verified, p_payment_slip_url, p_payment_slip_hash, p_slip_trans_ref, p_easyslip_response,
    p_booking_source, p_created_by, p_created_by
  ) RETURNING id INTO v_group_id;

  -- 3) Per item: re-check availability (sees prior inserts in THIS txn)
  --    + blocked dates, then insert the member booking row.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT quantity INTO v_room_qty FROM rooms WHERE id = (v_item->>'room_id')::uuid;
    IF v_room_qty IS NULL THEN
      RAISE EXCEPTION 'ROOM_NOT_FOUND';
    END IF;

    SELECT COUNT(*) INTO v_overlap_count
    FROM bookings
    WHERE room_id = (v_item->>'room_id')::uuid
      AND status IN ('confirmed', 'pending', 'verified')
      AND check_in < (v_item->>'check_out')::date
      AND check_out > (v_item->>'check_in')::date;

    IF v_overlap_count >= v_room_qty THEN
      RAISE EXCEPTION 'DATES_UNAVAILABLE:%', (v_item->>'room_id');
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM blocked_dates
      WHERE (homestay_id = p_homestay_id AND room_id IS NULL
             AND date >= (v_item->>'check_in')::date AND date < (v_item->>'check_out')::date)
         OR (room_id = (v_item->>'room_id')::uuid
             AND date >= (v_item->>'check_in')::date AND date < (v_item->>'check_out')::date)
    ) INTO v_blocked;

    IF v_blocked THEN
      RAISE EXCEPTION 'DATES_BLOCKED:%', (v_item->>'room_id');
    END IF;

    INSERT INTO bookings (
      homestay_id, group_id, room_id, guest_name, guest_email, guest_phone, guest_province,
      check_in, check_out, num_guests, total_price, discount_amount, status,
      easyslip_verified, payment_slip_hash, slip_trans_ref, payment_slip_url, easyslip_response,
      notes, payment_type, amount_paid, created_by, updated_by, selected_options, booking_source,
      guest_pricing_label, guest_pricing_surcharge
    ) VALUES (
      p_homestay_id, v_group_id, (v_item->>'room_id')::uuid, p_guest_name, p_guest_email, p_guest_phone, p_guest_province,
      (v_item->>'check_in')::date, (v_item->>'check_out')::date, (v_item->>'num_guests')::int,
      (v_item->>'total_price')::int, GREATEST(0, COALESCE((v_item->>'discount_amount')::int, 0)), p_status,
      -- Mirror only hash + url onto the row; trans_ref stays canonical on the group.
      p_easyslip_verified, p_payment_slip_hash, NULL, p_payment_slip_url, NULL,
      p_notes, p_payment_type, COALESCE((v_item->>'amount_paid')::int, 0), p_created_by, p_created_by,
      COALESCE(v_item->'selected_options', '[]'::jsonb), p_booking_source,
      NULLIF(v_item->>'guest_pricing_label', ''), COALESCE((v_item->>'guest_pricing_surcharge')::int, 0)
    );
  END LOOP;

  -- 4) Clear holds for this session and this phone across all items
  --    (mirror create_booking_atomic's hold cleanup).
  IF p_session_id IS NOT NULL THEN
    DELETE FROM booking_holds WHERE session_id = p_session_id;
  END IF;

  IF v_phone IS NOT NULL THEN
    DELETE FROM booking_holds h
    USING jsonb_array_elements(p_items) e
    WHERE h.room_id = (e->>'room_id')::uuid
      AND h.guest_phone = v_phone
      AND h.check_in < (e->>'check_out')::date
      AND h.check_out > (e->>'check_in')::date;
  END IF;

  RETURN v_group_id;
END;
$$ LANGUAGE plpgsql;

REVOKE ALL ON FUNCTION create_booking_group_atomic(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, booking_status, BOOLEAN, TEXT, TEXT, TEXT, JSONB,
  TEXT, INT, INT, INT, TEXT, TEXT, TEXT, JSONB
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_booking_group_atomic(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, booking_status, BOOLEAN, TEXT, TEXT, TEXT, JSONB,
  TEXT, INT, INT, INT, TEXT, TEXT, TEXT, JSONB
) TO service_role;
