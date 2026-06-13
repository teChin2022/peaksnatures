-- ============================================================
-- BOOKING GUEST PRICING SNAPSHOT
-- Snapshots the selected guest-composition tier on the booking so it
-- survives later edits/deletes of room_guest_pricing rows.
--   guest_pricing_label     - composed label in the guest's locale
--                             (e.g. "ผู้ใหญ่ 2 เด็ก 1 อายุ 0-5 ปี")
--   guest_pricing_surcharge - the PER-NIGHT surcharge unit applied,
--                             so date-change can recompute (surcharge x nights)
-- The surcharge total is already included in bookings.total_price.
-- ============================================================
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS guest_pricing_label TEXT,
  ADD COLUMN IF NOT EXISTS guest_pricing_surcharge INTEGER NOT NULL DEFAULT 0;
