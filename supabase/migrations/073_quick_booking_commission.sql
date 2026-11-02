-- Quick bookings (entered by the host from the dashboard: walk-in / phone / OTA
-- imports) are charged their own platform commission rate, separate from
-- bookings a guest makes on /[slug]. The channel is read from
-- bookings.booking_source at deduction time: 'guest' is the guest rate,
-- anything else is a quick booking (deductCommission, src/lib/billing.ts).
--
-- Both new columns start as copies of the existing rate, so no host's charge
-- changes until an admin sets a different quick rate.
--
-- hosts.quick_commission_pct_override is a billing column: it is deliberately
-- NOT in the migration 069 grant, so only the service role can write it.

ALTER TABLE platform_billing_config
  ADD COLUMN IF NOT EXISTS quick_commission_pct NUMERIC(5,2)
  CHECK (quick_commission_pct >= 0 AND quick_commission_pct <= 100);

UPDATE platform_billing_config
  SET quick_commission_pct = commission_pct
  WHERE quick_commission_pct IS NULL;

ALTER TABLE platform_billing_config
  ALTER COLUMN quick_commission_pct SET DEFAULT 5.00,
  ALTER COLUMN quick_commission_pct SET NOT NULL;

ALTER TABLE hosts
  ADD COLUMN IF NOT EXISTS quick_commission_pct_override NUMERIC(5,2) DEFAULT NULL
  CHECK (quick_commission_pct_override >= 0 AND quick_commission_pct_override <= 100);

-- An existing override was negotiated for every booking the host takes; keep
-- their quick bookings on it rather than moving them to the platform rate.
UPDATE hosts
  SET quick_commission_pct_override = commission_pct_override
  WHERE commission_pct_override IS NOT NULL
    AND quick_commission_pct_override IS NULL;

COMMENT ON COLUMN platform_billing_config.quick_commission_pct IS
  'Commission % charged on host quick bookings (booking_source <> ''guest''). commission_pct is the guest-booking rate.';
COMMENT ON COLUMN hosts.quick_commission_pct_override IS
  'Per-host quick-booking commission %. NULL = platform quick_commission_pct.';
