# Booking Date Change Feature — Design Plan

## Summary

Allow **guests** to change the `check_in` and `check_out` dates of a **confirmed** booking via the self-service booking search dialog. The host is **notified** of the change but does not need to approve it. Price is recalculated automatically and the guest is warned about any price difference before confirming.

---

## Decisions (from user input)

| Decision | Value |
|---|---|
| Who initiates? | **Guest only** (self-service) |
| Fee for changes? | **Always free** — no extra fee |
| Eligible statuses | **Confirmed** only |
| Price handling | Recalculate automatically, warn guest via popup |
| Availability | Must check new dates are available (excluding current booking) |

---

## Implementation Steps

### 1. Database Migration — `booking_date_changes` log table

Create `supabase/migrations/024_booking_date_change.sql`:

```sql
-- Log table to track date change history
CREATE TABLE booking_date_changes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  old_check_in DATE NOT NULL,
  old_check_out DATE NOT NULL,
  new_check_in DATE NOT NULL,
  new_check_out DATE NOT NULL,
  old_total_price INTEGER NOT NULL,
  new_total_price INTEGER NOT NULL,
  old_amount_paid INTEGER NOT NULL,
  new_amount_paid INTEGER NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_date_changes_booking_id ON booking_date_changes(booking_id);

-- RLS: Anyone can insert (guest self-service), hosts can view for their bookings
ALTER TABLE booking_date_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert date changes"
  ON booking_date_changes FOR INSERT WITH CHECK (true);

CREATE POLICY "Hosts can view date changes for own bookings"
  ON booking_date_changes FOR SELECT
  USING (booking_id IN (
    SELECT b.id FROM bookings b
    JOIN homestays h ON b.homestay_id = h.id
    JOIN hosts ho ON h.host_id = ho.id
    WHERE ho.user_id = auth.uid()
  ));
```

**Supabase RPC function** — `change_booking_dates_atomic`:

```sql
CREATE OR REPLACE FUNCTION change_booking_dates_atomic(
  p_booking_id UUID,
  p_guest_email TEXT,
  p_new_check_in DATE,
  p_new_check_out DATE,
  p_new_total_price INTEGER,
  p_new_amount_paid INTEGER
) RETURNS VOID AS $$
DECLARE
  v_booking RECORD;
  v_room_qty INT;
  v_overlap_count INT;
  v_blocked_count INT;
BEGIN
  -- Fetch and lock the booking
  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id FOR UPDATE;

  IF v_booking IS NULL THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND';
  END IF;

  IF v_booking.status != 'confirmed' THEN
    RAISE EXCEPTION 'INVALID_STATUS';
  END IF;

  IF v_booking.guest_email != p_guest_email THEN
    RAISE EXCEPTION 'EMAIL_MISMATCH';
  END IF;

  IF v_booking.checked_in_at IS NOT NULL THEN
    RAISE EXCEPTION 'ALREADY_CHECKED_IN';
  END IF;

  -- Lock the room
  PERFORM pg_advisory_xact_lock(hashtext(v_booking.room_id::text));

  SELECT quantity INTO v_room_qty FROM rooms WHERE id = v_booking.room_id;

  -- Check overlapping bookings (EXCLUDE current booking)
  SELECT COUNT(*) INTO v_overlap_count
  FROM bookings
  WHERE room_id = v_booking.room_id
    AND id != p_booking_id
    AND status IN ('pending', 'confirmed', 'verified')
    AND check_in < p_new_check_out
    AND check_out > p_new_check_in;

  IF v_overlap_count >= v_room_qty THEN
    RAISE EXCEPTION 'DATES_UNAVAILABLE';
  END IF;

  -- Check blocked dates
  SELECT COUNT(*) INTO v_blocked_count
  FROM blocked_dates
  WHERE homestay_id = v_booking.homestay_id
    AND date >= p_new_check_in
    AND date < p_new_check_out
    AND (room_id IS NULL OR room_id = v_booking.room_id);

  IF v_blocked_count > 0 THEN
    RAISE EXCEPTION 'DATES_BLOCKED';
  END IF;

  -- Log the change
  INSERT INTO booking_date_changes (
    booking_id, old_check_in, old_check_out, new_check_in, new_check_out,
    old_total_price, new_total_price, old_amount_paid, new_amount_paid
  ) VALUES (
    p_booking_id, v_booking.check_in, v_booking.check_out,
    p_new_check_in, p_new_check_out,
    v_booking.total_price, p_new_total_price,
    v_booking.amount_paid, p_new_amount_paid
  );

  -- Update the booking
  UPDATE bookings SET
    check_in = p_new_check_in,
    check_out = p_new_check_out,
    total_price = p_new_total_price,
    amount_paid = p_new_amount_paid
  WHERE id = p_booking_id;
END;
$$ LANGUAGE plpgsql;
```

### 2. API Route — `POST /api/bookings/change-dates`

Create `src/app/api/bookings/change-dates/route.ts`:

**Request body:**
```json
{
  "booking_id": "uuid",
  "guest_email": "guest@example.com",
  "homestay_id": "uuid",
  "new_check_in": "2025-03-10",
  "new_check_out": "2025-03-13"
}
```

**Logic:**
1. Validate input fields
2. Fetch booking + room + seasonal prices + host (with deposit settings)
3. Verify `status === "confirmed"` and `checked_in_at IS NULL`
4. Verify `guest_email` matches
5. Recalculate `total_price` using `calculateTotalPrice()` with new dates
6. Recalculate `amount_paid`:
   - If `payment_type === "full"` → `new_amount_paid = old amount_paid` (unchanged, treat as credit/debit note)
   - If `payment_type === "deposit"` → recalculate deposit using `getDepositForMonth()` with new check-in, but keep `amount_paid` at original value (guest already paid this deposit)
7. Call `change_booking_dates_atomic` RPC
8. Send notification email to guest (new "date changed" email)
9. Send notification to host (push/LINE) informing of the change
10. Return updated booking + price comparison

**Response:**
```json
{
  "success": true,
  "booking": { ... },
  "priceChange": {
    "oldTotal": 3000,
    "newTotal": 3600,
    "difference": 600,
    "oldAmountPaid": 1000,
    "newAmountPaid": 1000
  }
}
```

### 3. Notification — Date Change Email to Guest

Add `sendBookingDateChangeEmail()` to `src/lib/notifications.ts`:

- Subject: "Booking Dates Changed — {homestay name}"
- Show old dates → new dates
- Show old price → new price
- If price increased and `payment_type === "deposit"`: remind balance due on arrival
- If price decreased: note credit/adjustment

### 4. Notification — Date Change Alert to Host

Add `sendHostDateChangeNotification()` (push + LINE) to `src/lib/notifications.ts`:

- Similar format to existing host notifications
- Show: guest name, old dates → new dates, old price → new price
- Informational only (no action needed from host)

### 5. Guest UI — Date Change in `booking-search-dialog.tsx`

Add a **"Change Dates"** button visible when:
- `booking.status === "confirmed"`
- `booking.checked_in_at === null`

**Flow:**
1. Guest clicks "Change Dates"
2. Show a date picker (reuse calendar logic from `booking-section.tsx`)
   - Fetch booked ranges and blocked dates via existing `/api/bookings/availability` and `/api/blocked-dates`
   - **Exclude the current booking** from booked ranges (so the guest can re-select overlapping dates)
3. Guest selects new check-in / check-out
4. System calculates new price client-side using room's base price + seasonal prices
5. **Warning popup** shows:
   - Old dates → New dates
   - Old price → New price
   - Price difference (+ or -)
   - If price increased: "You will need to pay the additional ฿X on arrival"
   - If price decreased: "Your total has been reduced by ฿X"
6. Guest confirms → calls `POST /api/bookings/change-dates`
7. Show success message with updated booking details

### 6. i18n Messages

Add keys to `messages/en.json` and `messages/th.json` under `bookingSearch`:

```json
{
  "changeDates": "Change Dates",
  "changeDatesTitle": "Change Booking Dates",
  "changeDatesDesc": "Select new check-in and check-out dates",
  "changeDatesConfirm": "Confirm Date Change",
  "changeDatesCancel": "Keep Current Dates",
  "changeDatesSuccess": "Dates changed successfully!",
  "changeDatesError": "Failed to change dates. Please try again.",
  "changeDatesDatesUnavailable": "Selected dates are not available.",
  "changeDatesDatesBlocked": "Selected dates include blocked dates.",
  "changeDatesAlreadyCheckedIn": "Cannot change dates after check-in.",
  "changeDatesPriceIncrease": "The new total is ฿{newTotal} (was ฿{oldTotal}). You will need to pay an additional ฿{diff} on arrival.",
  "changeDatesPriceDecrease": "The new total is ฿{newTotal} (was ฿{oldTotal}). Your total has been reduced by ฿{diff}.",
  "changeDatesPriceSame": "The total price remains the same: ฿{total}.",
  "changeDatesWarningTitle": "Confirm Date Change",
  "oldDates": "Current Dates",
  "newDates": "New Dates"
}
```

### 7. Host Dashboard — View Date Change History (optional enhancement)

In `src/app/dashboard/bookings/page.tsx`, within the booking detail view:
- Show a small badge or note if the booking has had date changes
- Optionally show change history (old dates → new dates, when changed)

---

## Files to Create / Modify

| File | Action |
|---|---|
| `supabase/migrations/024_booking_date_change.sql` | **Create** — migration + RPC function |
| `src/app/api/bookings/change-dates/route.ts` | **Create** — API endpoint |
| `src/lib/notifications.ts` | **Modify** — add date change email + host notification |
| `src/components/booking/booking-search-dialog.tsx` | **Modify** — add "Change Dates" UI flow |
| `src/types/database.ts` | **Modify** — add `booking_date_changes` table type |
| `messages/en.json` | **Modify** — add i18n keys |
| `messages/th.json` | **Modify** — add i18n keys |
| `src/app/dashboard/bookings/page.tsx` | **Modify** (optional) — show date change history |

---

## Edge Cases & Rules

1. **Cannot change dates after check-in** — `checked_in_at IS NOT NULL` blocks the change
2. **Availability check excludes current booking** — so the guest can shift dates partially
3. **Payment stays the same** — `amount_paid` doesn't change (guest already paid). If new total > amount_paid, balance is due on arrival. If new total < amount_paid, note credit.
4. **Atomic operation** — RPC function ensures no race conditions with other bookings
5. **Only confirmed bookings** — pending/verified are still in review, cancelled/completed/rejected cannot change
6. **Blocked dates respected** — host-blocked dates prevent changes to those ranges
7. **Room quantity respected** — if room has quantity > 1, overlap check accounts for this

---

## Sequence Diagram (Guest Flow)

```
Guest → Search Booking → View Confirmed Booking
  → Click "Change Dates"
  → Date Picker shown (with availability)
  → Select new dates
  → System calculates new price
  → Warning popup: "Price changed from ฿X to ฿Y"
  → Guest confirms
  → API: POST /api/bookings/change-dates
    → RPC: change_booking_dates_atomic
      → Check status, email, availability, blocked dates
      → Log change in booking_date_changes
      → Update bookings row
    → Send email to guest
    → Send push/LINE to host
  → Show success + updated booking
```
