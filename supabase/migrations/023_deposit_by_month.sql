-- ************************************************************
-- 023: Deposit by Month
-- Allows hosts to configure different deposit amounts per month.
-- deposit_by_month is a JSONB object: {"1": 500, "2": 1000, ...}
-- Keys are month numbers (1–12), values are deposit amounts in ฿.
-- Falls back to deposit_amount for months without an entry.
-- ************************************************************

ALTER TABLE hosts ADD COLUMN IF NOT EXISTS deposit_by_month JSONB DEFAULT NULL;
