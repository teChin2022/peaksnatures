-- ============================================================
-- 059: Multi-room cart — booking groups
-- A cart of N rooms = N normal `bookings` rows (one per room) tied
-- together by a shared `booking_groups` parent that owns the SINGLE
-- payment + slip + combined money. Each room keeps being a normal
-- booking row, so availability / holds / reviews / date-change /
-- commission / admin+host displays all keep working unchanged.
--
-- Why a parent table (not just a column): bookings has a UNIQUE
-- partial index on slip_trans_ref, so the one shared slip's
-- trans_ref cannot be duplicated across N rows. The canonical slip
-- lives once on booking_groups; rows mirror only hash + url (the
-- bookings hash index is non-unique) and set slip_trans_ref = NULL.
--
-- Everything here is additive / nullable — existing single-room
-- bookings (group_id IS NULL) behave exactly as before.
-- ============================================================

-- ------------------------------------------------------------
-- 1. booking_groups — shared, once-only data for a cart
-- ------------------------------------------------------------
CREATE TABLE booking_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  homestay_id UUID NOT NULL REFERENCES homestays(id) ON DELETE CASCADE,

  -- Shared guest info (one set for the whole cart)
  guest_name TEXT NOT NULL,
  guest_email TEXT NOT NULL,
  guest_phone TEXT NOT NULL,
  guest_province TEXT,
  notes TEXT,

  -- Combined money (authoritative for the cart). Per-row shares live
  -- on each member booking and sum back to these values.
  total_price INTEGER NOT NULL DEFAULT 0,
  discount_amount INTEGER NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  payment_type TEXT NOT NULL DEFAULT 'full',
  amount_paid INTEGER NOT NULL DEFAULT 0,

  -- Coordinating status (per-row status stays authoritative for
  -- availability; this mirrors the group's overall state).
  status booking_status NOT NULL DEFAULT 'pending',

  -- The ONE slip for the whole cart (canonical home for trans_ref).
  easyslip_verified BOOLEAN NOT NULL DEFAULT false,
  payment_slip_url TEXT,
  payment_slip_hash TEXT,
  slip_trans_ref TEXT,
  easyslip_response JSONB,

  booking_source TEXT NOT NULL DEFAULT 'guest',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'system',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NOT NULL DEFAULT 'system'
);

-- Mirror the bookings slip-dedup posture onto the group's canonical slip.
CREATE UNIQUE INDEX idx_booking_groups_slip_trans_ref
  ON booking_groups(slip_trans_ref) WHERE slip_trans_ref IS NOT NULL;
CREATE INDEX idx_booking_groups_slip_hash
  ON booking_groups(payment_slip_hash) WHERE payment_slip_hash IS NOT NULL;
CREATE INDEX idx_booking_groups_homestay_id ON booking_groups(homestay_id);

CREATE TRIGGER trg_booking_groups_updated_at
  BEFORE UPDATE ON booking_groups FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- 2. bookings.group_id — nullable parent link
-- ------------------------------------------------------------
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES booking_groups(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_group_id ON bookings(group_id) WHERE group_id IS NOT NULL;

-- ------------------------------------------------------------
-- 3. promo_redemptions — one redemption per cart (attach to group)
--    booking_id becomes optional; a redemption targets either a
--    single booking OR a group. The existing UNIQUE(booking_id)
--    keeps single-booking dedup (NULLs are distinct in Postgres),
--    and a new partial unique enforces one redemption per group.
-- ------------------------------------------------------------
ALTER TABLE promo_redemptions
  ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES booking_groups(id) ON DELETE CASCADE;
ALTER TABLE promo_redemptions
  ALTER COLUMN booking_id DROP NOT NULL;
ALTER TABLE promo_redemptions
  ADD CONSTRAINT promo_redemption_target_chk
    CHECK (booking_id IS NOT NULL OR group_id IS NOT NULL);
CREATE UNIQUE INDEX idx_promo_redemptions_group
  ON promo_redemptions(group_id) WHERE group_id IS NOT NULL;

-- ------------------------------------------------------------
-- 4. RLS — mirror bookings (writes go through the service role RPC,
--    which bypasses RLS; hosts read groups for their own homestays).
-- ------------------------------------------------------------
ALTER TABLE booking_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Hosts can view booking groups for own homestays"
  ON booking_groups FOR SELECT
  USING (
    homestay_id IN (
      SELECT h.id FROM homestays h
      JOIN hosts ho ON h.host_id = ho.id
      WHERE ho.user_id = auth.uid()
    )
  );

CREATE POLICY "Hosts can manage booking groups for their homestays"
  ON booking_groups FOR ALL
  USING (homestay_id IN (
    SELECT h.id FROM homestays h
    JOIN hosts ho ON h.host_id = ho.id
    WHERE ho.user_id = auth.uid()
  ));
