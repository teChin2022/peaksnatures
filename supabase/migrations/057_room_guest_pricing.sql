-- ============================================================
-- ROOM GUEST PRICING (per-composition surcharge tiers per room)
-- A host defines a list of guest compositions (adults + children),
-- each adding a per-night surcharge on top of the room base price.
-- The booking page shows these as a dropdown.
-- Mirrors the room_options table + RLS pattern.
-- ============================================================
CREATE TABLE room_guest_pricing (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  adults INTEGER NOT NULL DEFAULT 2,
  children INTEGER NOT NULL DEFAULT 0,
  detail TEXT,
  surcharge INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'system',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NOT NULL DEFAULT 'system'
);

CREATE INDEX idx_room_guest_pricing_room_id ON room_guest_pricing(room_id);

CREATE TRIGGER trg_room_guest_pricing_updated_at
  BEFORE UPDATE ON room_guest_pricing FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Room Guest Pricing RLS
ALTER TABLE room_guest_pricing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view room guest pricing"
  ON room_guest_pricing FOR SELECT
  USING (true);

CREATE POLICY "Hosts can manage guest pricing of own rooms"
  ON room_guest_pricing FOR ALL
  USING (room_id IN (
    SELECT r.id FROM rooms r
    JOIN homestays h ON r.homestay_id = h.id
    JOIN hosts ho ON h.host_id = ho.id
    WHERE ho.user_id = auth.uid()
  ));
