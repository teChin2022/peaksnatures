-- Add self-service check-in / check-out timestamps to bookings.
-- Guests scan a QR code at the property to record these.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS checked_out_at TIMESTAMPTZ;
