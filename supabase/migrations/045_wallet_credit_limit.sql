-- 045: Wallet credit floor
-- Adds per-host credit limit and timestamp tracking when balance first went
-- negative. Used by isHostBlocked() to soft-block commission hosts who have
-- been overdrawn past GRACE_PERIOD_DAYS.

ALTER TABLE hosts
  ADD COLUMN IF NOT EXISTS wallet_credit_limit numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wallet_negative_since timestamptz;

-- Backfill: hosts already in the red get wallet_negative_since = now().
UPDATE hosts
  SET wallet_negative_since = now()
  WHERE wallet_balance < 0 AND wallet_negative_since IS NULL;
