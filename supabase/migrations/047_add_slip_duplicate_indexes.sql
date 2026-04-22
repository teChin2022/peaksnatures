-- Indexes for slip duplicate detection across secondary tables.
-- /api/verify-slip runs two parallel 4-way duplicate checks (slip_hash, then slip_trans_ref)
-- against bookings, date_change_requests, invoices, wallet_transactions. Only bookings had
-- indexes (migration 006); the other three tables scanned sequentially.

CREATE INDEX IF NOT EXISTS idx_date_change_requests_slip_hash
  ON date_change_requests(slip_hash) WHERE slip_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_date_change_requests_slip_trans_ref
  ON date_change_requests(slip_trans_ref) WHERE slip_trans_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_slip_hash
  ON invoices(slip_hash) WHERE slip_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_slip_trans_ref
  ON invoices(slip_trans_ref) WHERE slip_trans_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_slip_hash
  ON wallet_transactions(slip_hash) WHERE slip_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_transactions_slip_trans_ref
  ON wallet_transactions(slip_trans_ref) WHERE slip_trans_ref IS NOT NULL;
