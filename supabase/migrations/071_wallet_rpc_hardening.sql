-- ============================================================================
-- 071: Wallet writes decided under the lock.
--
-- 1. deduct_wallet_commission charges a booking at most once.
--    deductCommission (src/lib/billing.ts) counted the booking's commission and
--    refund rows, then called this RPC — two steps with nothing holding them
--    together. Two confirmations of the same booking at once, or a live call
--    racing the retry queue, both counted 0 and both charged. The same count
--    now runs here, after the per-host advisory lock, where a second caller
--    sees the first one's committed row. A skipped call returns the current
--    balance and a NULL transaction_id, and writes nothing. The rule is the
--    app's own: charged while commissions outnumber refunds, which keeps the
--    deduct → refund → deduct cycle of a date change working.
--
-- 2. adjust_wallet replaces the admin route's read-modify-write.
--    POST /api/admin/hosts/[id]/wallet read the balance, added the adjustment
--    in JavaScript and wrote the sum back with no lock, so a commission
--    deducted in between was silently overwritten. It also never maintained
--    wallet_negative_since: a credit back to >= 0 left the old timestamp (the
--    next dip blocked with no grace period) and a debit below zero left it NULL
--    (the host was never blocked). A failed ledger insert was only logged.
--    This takes the same lock, applies the same wallet_negative_since rule as
--    topup_wallet and deduct_wallet_commission, and writes the ledger row in
--    the same transaction.
--
-- Both are service-role only, as 066 and 070 are.
-- ============================================================================

CREATE OR REPLACE FUNCTION deduct_wallet_commission(
  p_host_id UUID,
  p_amount INTEGER,
  p_booking_id TEXT,
  p_description TEXT DEFAULT 'Commission deduction'
)
RETURNS TABLE(new_balance INTEGER, transaction_id UUID) AS $$
DECLARE
  v_new_balance INTEGER;
  v_txn_id UUID;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_host_id::text));

  -- Already charged, and not refunded since: write nothing.
  IF (SELECT count(*) FROM wallet_transactions
        WHERE reference_id = p_booking_id AND type = 'commission')
   > (SELECT count(*) FROM wallet_transactions
        WHERE reference_id = p_booking_id AND type = 'refund') THEN
    SELECT h.wallet_balance INTO v_new_balance FROM hosts h WHERE h.id = p_host_id;
    RETURN QUERY SELECT v_new_balance, NULL::UUID;
    RETURN;
  END IF;

  UPDATE hosts
  SET wallet_balance = wallet_balance - p_amount,
      wallet_negative_since = CASE
        WHEN (wallet_balance - p_amount) < 0 AND wallet_negative_since IS NULL THEN now()
        ELSE wallet_negative_since
      END
  WHERE id = p_host_id
  RETURNING wallet_balance INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'HOST_NOT_FOUND';
  END IF;

  INSERT INTO wallet_transactions (host_id, type, amount, balance_after, reference_id, description, status, created_by)
  VALUES (p_host_id, 'commission', -p_amount, v_new_balance, p_booking_id, p_description, 'verified', 'system')
  RETURNING id INTO v_txn_id;

  RETURN QUERY SELECT v_new_balance, v_txn_id;
END;
$$ LANGUAGE plpgsql;

REVOKE ALL ON FUNCTION public.deduct_wallet_commission(UUID, INTEGER, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deduct_wallet_commission(UUID, INTEGER, TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION adjust_wallet(
  p_host_id UUID,
  p_amount INTEGER,
  p_description TEXT,
  p_created_by TEXT
)
RETURNS TABLE(new_balance INTEGER, transaction_id UUID) AS $$
DECLARE
  v_new_balance INTEGER;
  v_txn_id UUID;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_host_id::text));

  UPDATE hosts
  SET wallet_balance = wallet_balance + p_amount,
      wallet_negative_since = CASE
        WHEN (wallet_balance + p_amount) >= 0 THEN NULL
        WHEN wallet_negative_since IS NULL THEN now()
        ELSE wallet_negative_since
      END,
      updated_by = p_created_by
  WHERE id = p_host_id
  RETURNING wallet_balance INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'HOST_NOT_FOUND';
  END IF;

  INSERT INTO wallet_transactions (host_id, type, amount, balance_after, description, status, created_by)
  VALUES (p_host_id, 'adjustment', p_amount, v_new_balance, p_description, 'verified', p_created_by)
  RETURNING id INTO v_txn_id;

  RETURN QUERY SELECT v_new_balance, v_txn_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION adjust_wallet(UUID, INTEGER, TEXT, TEXT) IS
  'Atomically apply an admin wallet adjustment (positive credits, negative debits) with its ledger row, maintaining wallet_negative_since. Called only by POST /api/admin/hosts/[id]/wallet. Raises HOST_NOT_FOUND.';

REVOKE ALL ON FUNCTION public.adjust_wallet(UUID, INTEGER, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_wallet(UUID, INTEGER, TEXT, TEXT) TO service_role;
