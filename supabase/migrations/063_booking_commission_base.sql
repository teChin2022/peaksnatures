-- Quick bookings (walk-in / phone / OTA imports) carry a host-entered
-- total_price that reflects what the host charged the guest elsewhere — and it
-- defaults to 0 when the host leaves the field blank. Commission for those
-- bookings is charged on the room's own configured rate instead (seasonal price
-- where a season covers the night, base price otherwise).
--
-- NULL means "use the normal GMV base" (total_price + discount_amount), so
-- every existing booking and every guest-booking path is unaffected.
--
-- Stored on the row rather than passed as an argument so processBillingRetryQueue
-- replays a failed deduction with the same base it originally computed.

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS commission_base INTEGER;

COMMENT ON COLUMN bookings.commission_base IS
  'Overrides total_price + discount_amount as the commission base. Set for quick bookings, where total_price is the host''s own OTA/walk-in figure rather than the room rate. NULL = use the normal GMV base.';
