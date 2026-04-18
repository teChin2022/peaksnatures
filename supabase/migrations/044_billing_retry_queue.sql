-- 044: Billing retry queue
-- Captures commission deduct/refund RPC failures so they can be retried
-- by the daily cron instead of silently lost.

CREATE TABLE IF NOT EXISTS billing_retry_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation text NOT NULL CHECK (operation IN ('deduct_commission','refund_commission')),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  last_attempt_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Partial index: only pending rows (resolved_at IS NULL).
CREATE INDEX IF NOT EXISTS billing_retry_queue_pending_idx
  ON billing_retry_queue (next_attempt_at)
  WHERE resolved_at IS NULL;

-- Prevent duplicate pending rows for the same (operation, booking_id) pair.
CREATE UNIQUE INDEX IF NOT EXISTS billing_retry_queue_pending_unique_idx
  ON billing_retry_queue (operation, booking_id)
  WHERE resolved_at IS NULL;
