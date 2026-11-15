-- ============================================================================
-- 077: verified_slips — what EasySlip read off each real guest slip, kept on
-- the server.
--
-- Security audit 2026-11-15, F-01 and F-05. /api/verify-slip used to hand its
-- verdict to the browser and keep nothing, and POST /api/bookings, /group and
-- /pay-balance then trusted `easyslip_verified` and any `slip_hash` string the
-- browser sent back. Anyone could confirm a booking, or settle a balance,
-- without paying.
--
-- Now verify-slip records each slip EasySlip accepted (amount, receiver,
-- transRef) here, and the booking routes claim the row (src/lib/verified-
-- slips.ts): a booking is confirmed only if the slip's amount equals the
-- amount the server charges and its receiver is this host's PromptPay or bank
-- account. Anything else is created pending for the host to check, which is
-- what a failed verification already did, so no real transfer is refused.
-- consumed_at makes one slip confirm one payment only.
--
-- Service role only: RLS on with no policies, like 067 and 074. The receiver
-- is EasySlip's own object (masked account numbers and the receiver's name,
-- i.e. the host's details, not the guest's).
--
-- Rollback: DROP TABLE verified_slips; (the routes then leave every slip
-- booking pending until the code is rolled back too).
-- ============================================================================

CREATE TABLE verified_slips (
  slip_hash   TEXT PRIMARY KEY,
  trans_ref   TEXT,
  amount      NUMERIC(12, 2) NOT NULL,
  receiver    JSONB,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  consumed_at TIMESTAMPTZ
);

-- For a later retention sweep (the rows are only useful for about an hour).
CREATE INDEX idx_verified_slips_verified_at ON verified_slips (verified_at);

ALTER TABLE verified_slips ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON verified_slips FROM anon, authenticated;
