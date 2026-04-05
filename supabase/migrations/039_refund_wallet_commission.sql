-- ============================================================
-- 039: Refund Wallet Commission
-- Adds atomic refund function and index for commission lookups
-- ============================================================

-- Index for efficient commission/refund lookups by booking
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_reference_id
  ON wallet_transactions(reference_id) WHERE reference_id IS NOT NULL;

-- ============================================================
-- Atomic wallet commission refund function
-- Idempotency is handled at the application layer to support
-- date-change cycles (deduct → refund → deduct → refund).
-- ============================================================
CREATE OR REPLACE FUNCTION refund_wallet_commission(
  p_host_id UUID,
  p_amount INTEGER,
  p_booking_id TEXT,
  p_description TEXT DEFAULT 'Commission refund'
)
RETURNS TABLE(new_balance INTEGER, transaction_id UUID) AS $$
DECLARE
  v_new_balance INTEGER;
  v_txn_id UUID;
BEGIN
  -- Advisory lock on host to prevent race conditions
  PERFORM pg_advisory_xact_lock(hashtext(p_host_id::text));

  -- Refund to wallet
  UPDATE hosts
  SET wallet_balance = wallet_balance + p_amount
  WHERE id = p_host_id
  RETURNING wallet_balance INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'HOST_NOT_FOUND';
  END IF;

  -- Insert refund transaction record
  INSERT INTO wallet_transactions (host_id, type, amount, balance_after, reference_id, description, status, created_by)
  VALUES (p_host_id, 'refund', p_amount, v_new_balance, p_booking_id, p_description, 'verified', 'system')
  RETURNING id INTO v_txn_id;

  RETURN QUERY SELECT v_new_balance, v_txn_id;
END;
$$ LANGUAGE plpgsql;
