-- ============================================================
-- 051: Promo Codes & Affiliate Recommender Commission
-- - Per-homestay opt-in feature flag on `homestays`
-- - `promo_codes` table: host-defined codes with optional Recommender block
-- - `promo_redemptions` table: one row per use, drives payout tracking
-- ============================================================

-- ------------------------------------------------------------
-- 1. Master enable/disable flag on homestays (opt-in per host)
-- ------------------------------------------------------------
ALTER TABLE homestays
  ADD COLUMN IF NOT EXISTS promo_codes_enabled BOOLEAN NOT NULL DEFAULT false;

-- ------------------------------------------------------------
-- 2. promo_codes
-- ------------------------------------------------------------
CREATE TABLE promo_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  homestay_id UUID NOT NULL REFERENCES homestays(id) ON DELETE CASCADE,
  code TEXT NOT NULL,

  -- Discount applied to the guest's booking total.
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value NUMERIC(10,2) NOT NULL CHECK (discount_value >= 0),

  -- Optional Recommender block. If recommender_name is set, host can also
  -- attach a commission_type/value so the system computes per-redemption payout.
  recommender_name TEXT,
  recommender_phone TEXT,
  recommender_promptpay TEXT,
  recommender_note TEXT,
  commission_type TEXT CHECK (commission_type IN ('percentage', 'fixed')),
  commission_value NUMERIC(10,2) CHECK (commission_value IS NULL OR commission_value >= 0),

  -- Constraints
  start_at DATE,
  expires_at DATE,
  max_uses INTEGER CHECK (max_uses IS NULL OR max_uses > 0),
  times_used INTEGER NOT NULL DEFAULT 0,
  one_use_per_guest BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'system',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NOT NULL DEFAULT 'system',

  -- Validity range must be coherent
  CONSTRAINT promo_codes_dates_chk CHECK (start_at IS NULL OR expires_at IS NULL OR expires_at >= start_at),
  -- Commission fields require recommender_name
  CONSTRAINT promo_codes_commission_chk CHECK (
    (commission_type IS NULL AND commission_value IS NULL)
    OR (recommender_name IS NOT NULL AND commission_type IS NOT NULL AND commission_value IS NOT NULL)
  ),
  -- Percentage discounts must be 0..100
  CONSTRAINT promo_codes_pct_range_chk CHECK (
    discount_type <> 'percentage' OR (discount_value >= 0 AND discount_value <= 100)
  ),
  CONSTRAINT promo_codes_commission_pct_range_chk CHECK (
    commission_type IS NULL OR commission_type <> 'percentage' OR (commission_value >= 0 AND commission_value <= 100)
  )
);

CREATE UNIQUE INDEX idx_promo_codes_homestay_code ON promo_codes(homestay_id, code);
CREATE INDEX idx_promo_codes_homestay_active ON promo_codes(homestay_id, is_active);

CREATE TRIGGER trg_promo_codes_updated_at
  BEFORE UPDATE ON promo_codes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- 3. promo_redemptions
-- ------------------------------------------------------------
CREATE TABLE promo_redemptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  promo_code_id UUID NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  discount_amount INTEGER NOT NULL CHECK (discount_amount >= 0),
  commission_amount INTEGER NOT NULL DEFAULT 0 CHECK (commission_amount >= 0),
  payout_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (payout_status IN ('pending', 'paid', 'cancelled')),
  paid_at TIMESTAMPTZ,
  paid_note TEXT,

  -- Denormalized for one-use-per-guest enforcement & quick host display
  guest_phone TEXT NOT NULL,
  guest_email TEXT NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'system',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NOT NULL DEFAULT 'system',

  UNIQUE (booking_id)
);

CREATE INDEX idx_promo_redemptions_code_phone ON promo_redemptions(promo_code_id, guest_phone);
CREATE INDEX idx_promo_redemptions_code_email ON promo_redemptions(promo_code_id, guest_email);
CREATE INDEX idx_promo_redemptions_code_status ON promo_redemptions(promo_code_id, payout_status);

CREATE TRIGGER trg_promo_redemptions_updated_at
  BEFORE UPDATE ON promo_redemptions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- 4. RLS policies
-- ------------------------------------------------------------
ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_redemptions ENABLE ROW LEVEL SECURITY;

-- Hosts manage promo codes for homestays they own
CREATE POLICY "Hosts can manage promo codes for own homestays"
  ON promo_codes FOR ALL
  USING (homestay_id IN (
    SELECT h.id FROM homestays h
    JOIN hosts ho ON h.host_id = ho.id
    WHERE ho.user_id = auth.uid()
  ))
  WITH CHECK (homestay_id IN (
    SELECT h.id FROM homestays h
    JOIN hosts ho ON h.host_id = ho.id
    WHERE ho.user_id = auth.uid()
  ));

-- Hosts can SELECT and UPDATE redemptions for their own codes (for the
-- "mark as paid" flow). INSERT is intentionally not exposed — only the
-- service role (booking API) creates redemption rows.
CREATE POLICY "Hosts can view redemptions for own codes"
  ON promo_redemptions FOR SELECT
  USING (promo_code_id IN (
    SELECT pc.id FROM promo_codes pc
    JOIN homestays h ON pc.homestay_id = h.id
    JOIN hosts ho ON h.host_id = ho.id
    WHERE ho.user_id = auth.uid()
  ));

CREATE POLICY "Hosts can update payout status for own redemptions"
  ON promo_redemptions FOR UPDATE
  USING (promo_code_id IN (
    SELECT pc.id FROM promo_codes pc
    JOIN homestays h ON pc.homestay_id = h.id
    JOIN hosts ho ON h.host_id = ho.id
    WHERE ho.user_id = auth.uid()
  ))
  WITH CHECK (promo_code_id IN (
    SELECT pc.id FROM promo_codes pc
    JOIN homestays h ON pc.homestay_id = h.id
    JOIN hosts ho ON h.host_id = ho.id
    WHERE ho.user_id = auth.uid()
  ));
