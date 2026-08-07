-- Commission hosts are warned once their wallet dips below the low-balance
-- threshold (LOW_WALLET_THRESHOLD in src/lib/billing.ts), before the balance
-- goes negative and the grace countdown to a booking block begins.
--
-- This column makes the daily cron warn once per dip instead of every day:
-- it is stamped when the alert goes out and cleared once the host tops back
-- up above the threshold, which re-arms the warning for the next dip.
-- The threshold itself deliberately lives in TypeScript, not here.

ALTER TABLE hosts ADD COLUMN IF NOT EXISTS wallet_low_notified_at TIMESTAMPTZ;

COMMENT ON COLUMN hosts.wallet_low_notified_at IS
  'When the low-wallet-balance alert was last sent. NULL = armed, ready to warn.';

-- Partial index: the cron scans for commission hosts still needing a warning.
CREATE INDEX IF NOT EXISTS idx_hosts_wallet_low_pending
  ON hosts (wallet_balance)
  WHERE plan_type = 'commission' AND wallet_low_notified_at IS NULL;
