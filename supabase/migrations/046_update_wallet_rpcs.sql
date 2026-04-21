-- 046: Update wallet RPCs to maintain wallet_negative_since
-- deduct → sets wallet_negative_since when balance drops below 0
-- topup → clears wallet_negative_since when balance returns to >= 0

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

CREATE OR REPLACE FUNCTION topup_wallet(
  p_host_id UUID,
  p_amount INTEGER,
  p_slip_url TEXT DEFAULT NULL,
  p_slip_hash TEXT DEFAULT NULL,
  p_slip_trans_ref TEXT DEFAULT NULL,
  p_easyslip_verified BOOLEAN DEFAULT false,
  p_easyslip_response JSONB DEFAULT NULL,
  p_created_by TEXT DEFAULT 'host'
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
        ELSE wallet_negative_since
      END
  WHERE id = p_host_id
  RETURNING wallet_balance INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'HOST_NOT_FOUND';
  END IF;

  INSERT INTO wallet_transactions (
    host_id, type, amount, balance_after, description,
    slip_url, slip_hash, slip_trans_ref, easyslip_verified, easyslip_response,
    status, created_by
  )
  VALUES (
    p_host_id, 'topup', p_amount, v_new_balance, 'Wallet top-up',
    p_slip_url, p_slip_hash, p_slip_trans_ref, p_easyslip_verified, p_easyslip_response,
    'verified', p_created_by
  )
  RETURNING id INTO v_txn_id;

  RETURN QUERY SELECT v_new_balance, v_txn_id;
END;
$$ LANGUAGE plpgsql;

-- Refund should also clear wallet_negative_since when balance recovers.
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
  PERFORM pg_advisory_xact_lock(hashtext(p_host_id::text));

  UPDATE hosts
  SET wallet_balance = wallet_balance + p_amount,
      wallet_negative_since = CASE
        WHEN (wallet_balance + p_amount) >= 0 THEN NULL
        ELSE wallet_negative_since
      END
  WHERE id = p_host_id
  RETURNING wallet_balance INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'HOST_NOT_FOUND';
  END IF;

  INSERT INTO wallet_transactions (host_id, type, amount, balance_after, reference_id, description, status, created_by)
  VALUES (p_host_id, 'refund', p_amount, v_new_balance, p_booking_id, p_description, 'verified', 'system')
  RETURNING id INTO v_txn_id;

  RETURN QUERY SELECT v_new_balance, v_txn_id;
END;
$$ LANGUAGE plpgsql;
