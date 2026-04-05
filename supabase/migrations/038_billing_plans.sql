-- ============================================================
-- 038: Billing & Plans System
-- Adds plan types, wallet, commission, invoices for host billing
-- ============================================================

-- ============================================================
-- 1. New columns on hosts table
-- ============================================================
ALTER TABLE hosts
  ADD COLUMN IF NOT EXISTS plan_type TEXT NOT NULL DEFAULT 'free'
    CHECK (plan_type IN ('free', 'commission', 'fixed_rate')),
  ADD COLUMN IF NOT EXISTS plan_free_expires_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS plan_pending_type TEXT DEFAULT NULL
    CHECK (plan_pending_type IS NULL OR plan_pending_type IN ('commission', 'fixed_rate')),
  ADD COLUMN IF NOT EXISTS plan_pending_effective_at DATE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS wallet_balance INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_pct_override NUMERIC(5,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS fixed_rate_override INTEGER DEFAULT NULL;

-- ============================================================
-- 2. Platform Billing Config (singleton)
-- ============================================================
CREATE TABLE platform_billing_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  commission_pct NUMERIC(5,2) NOT NULL DEFAULT 5.00,
  fixed_rate_amount INTEGER NOT NULL DEFAULT 0,
  promptpay_id TEXT,
  bank_name TEXT,
  bank_account_number TEXT,
  bank_account_name TEXT,
  payment_display TEXT NOT NULL DEFAULT 'qr'
    CHECK (payment_display IN ('qr', 'bank')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE platform_billing_config ENABLE ROW LEVEL SECURITY;
-- No RLS policies = service-role only access

CREATE TRIGGER trg_platform_billing_config_updated_at
  BEFORE UPDATE ON platform_billing_config FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed default row
INSERT INTO platform_billing_config (commission_pct, fixed_rate_amount, payment_display)
VALUES (5.00, 0, 'qr');

-- ============================================================
-- 3. Wallet Transactions (append-only ledger)
-- ============================================================
CREATE TABLE wallet_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  host_id UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('topup', 'commission', 'refund', 'adjustment')),
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  reference_id TEXT,
  description TEXT,
  slip_url TEXT,
  slip_hash TEXT,
  slip_trans_ref TEXT,
  easyslip_verified BOOLEAN DEFAULT false,
  easyslip_response JSONB,
  status TEXT NOT NULL DEFAULT 'verified'
    CHECK (status IN ('pending', 'verified', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'system'
);

CREATE INDEX idx_wallet_transactions_host_id ON wallet_transactions(host_id);

ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Hosts can view own wallet transactions"
  ON wallet_transactions FOR SELECT
  USING (host_id IN (
    SELECT id FROM hosts WHERE user_id = auth.uid()
  ));

-- ============================================================
-- 4. Invoices (fixed-rate monthly billing)
-- ============================================================
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  host_id UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'overdue')),
  slip_url TEXT,
  slip_hash TEXT,
  slip_trans_ref TEXT,
  easyslip_verified BOOLEAN DEFAULT false,
  easyslip_response JSONB,
  paid_at TIMESTAMPTZ,
  due_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'system',
  updated_by TEXT NOT NULL DEFAULT 'system'
);

CREATE INDEX idx_invoices_host_status ON invoices(host_id, status);
CREATE INDEX idx_invoices_due_date ON invoices(due_date);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Hosts can view own invoices"
  ON invoices FOR SELECT
  USING (host_id IN (
    SELECT id FROM hosts WHERE user_id = auth.uid()
  ));

CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 5. Atomic wallet deduction function (commission)
-- ============================================================
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
  -- Advisory lock on host to prevent race conditions
  PERFORM pg_advisory_xact_lock(hashtext(p_host_id::text));

  -- Deduct from wallet (can go negative)
  UPDATE hosts
  SET wallet_balance = wallet_balance - p_amount
  WHERE id = p_host_id
  RETURNING wallet_balance INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'HOST_NOT_FOUND';
  END IF;

  -- Insert transaction record
  INSERT INTO wallet_transactions (host_id, type, amount, balance_after, reference_id, description, status, created_by)
  VALUES (p_host_id, 'commission', -p_amount, v_new_balance, p_booking_id, p_description, 'verified', 'system')
  RETURNING id INTO v_txn_id;

  RETURN QUERY SELECT v_new_balance, v_txn_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 6. Atomic wallet top-up function
-- ============================================================
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
  SET wallet_balance = wallet_balance + p_amount
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
