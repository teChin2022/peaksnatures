-- Add columns for duplicate slip detection
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_slip_hash TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS slip_trans_ref TEXT;

-- Index for fast duplicate lookups
CREATE INDEX IF NOT EXISTS idx_bookings_slip_hash ON bookings(payment_slip_hash) WHERE payment_slip_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_slip_trans_ref ON bookings(slip_trans_ref) WHERE slip_trans_ref IS NOT NULL;
