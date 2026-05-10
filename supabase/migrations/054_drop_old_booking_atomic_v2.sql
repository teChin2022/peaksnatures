-- Drop the old create_booking_atomic overload (from migration 050) that lacks p_discount_amount.
-- PostgREST cannot disambiguate between the two overloads because p_discount_amount has a default value,
-- causing PGRST203 ("Could not choose the best candidate function") for any caller that omits it
-- (e.g. /api/bookings/quick) — surfacing as HTTP 500.
-- The version from migration 052 (with p_discount_amount) is the canonical one.
-- Mirrors the fix pattern from migration 042.
DROP FUNCTION IF EXISTS create_booking_atomic(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT,
  DATE, DATE, INT, INT, booking_status,
  BOOLEAN, TEXT, TEXT, TEXT, JSONB,
  TEXT, TEXT, TEXT, INT, TEXT, JSONB, TEXT
);
