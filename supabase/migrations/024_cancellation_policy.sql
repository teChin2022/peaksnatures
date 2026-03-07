-- ************************************************************
-- 024: Cancellation Policy
-- Allows hosts to configure how many days before check-in
-- a guest can cancel a confirmed booking.
-- cancellation_days = 0 means guest cancellation is disabled.
-- Also adds cancelled_by and cancelled_at to bookings
-- to track who cancelled and when.
-- ************************************************************

ALTER TABLE hosts ADD COLUMN IF NOT EXISTS cancellation_days INTEGER NOT NULL DEFAULT 0;

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancelled_by TEXT DEFAULT NULL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ DEFAULT NULL;
