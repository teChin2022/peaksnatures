-- Add cancel_reason column to bookings table
-- Used when host cancels a flagged booking after manual review
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
