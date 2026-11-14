-- ============================================================================
-- 075: hosts.guest_booking_mode — which booking flows a host opens to guests.
--
--   normal  the guest uploads a PromptPay slip, EasySlip verifies it and the
--           booking confirms at once (today's behaviour).
--   quick   the guest transfers, taps "I have transferred" and the booking is
--           created `pending`; the host checks the slip in chat and confirms.
--   both    the guest chooses at the payment step.
--
-- DEFAULT 'normal' keeps every existing host exactly as they are. A host picks
-- the mode on the dashboard homestay page, from the browser, so the column is
-- added to the migration 069 grant below; without it that save fails with
-- 42501 (permission denied for table hosts). It is not a billing column.
--
-- Apply this BEFORE deploying code that selects the column: a route that names
-- guest_booking_mode in its select fails the whole query while it is missing.
--
-- ROLLBACK (no data worth keeping; the grant goes with the column):
--   ALTER TABLE hosts DROP COLUMN guest_booking_mode;
-- ============================================================================

ALTER TABLE hosts
  ADD COLUMN IF NOT EXISTS guest_booking_mode TEXT NOT NULL DEFAULT 'normal'
  CONSTRAINT hosts_guest_booking_mode_check
  CHECK (guest_booking_mode IN ('normal', 'quick', 'both'));

COMMENT ON COLUMN hosts.guest_booking_mode IS
  'Guest booking flows this host opens: normal (EasySlip verifies the slip, instant confirm), quick (pending until the host confirms by hand) or both. Enforced server-side by /api/bookings and /api/bookings/group.';

-- Additive: 069 already revoked the table-level UPDATE; this adds one column.
GRANT UPDATE (guest_booking_mode) ON public.hosts TO authenticated;
