-- Drop the old create_booking_atomic overload (from migration 032) that lacks p_booking_source.
-- PostgREST cannot disambiguate between the two overloads because p_booking_source has a default value.
-- The version from migration 041 (with p_booking_source) is the canonical one.
DROP FUNCTION IF EXISTS create_booking_atomic(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT,
  DATE, DATE, INT, INT, booking_status,
  BOOLEAN, TEXT, TEXT, TEXT, JSONB,
  TEXT, TEXT, TEXT, INT, TEXT, JSONB
);
