-- ============================================================
-- 018: Room Seasonal Prices
-- Allows hosts to configure per-room price overrides for
-- custom date ranges (e.g. high season, holidays).
-- ============================================================

CREATE TABLE room_seasonal_prices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  price_per_night INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT check_date_range CHECK (end_date >= start_date)
);

CREATE INDEX idx_seasonal_prices_room_id ON room_seasonal_prices(room_id);

-- RLS
ALTER TABLE room_seasonal_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view seasonal prices"
  ON room_seasonal_prices FOR SELECT
  USING (true);

CREATE POLICY "Hosts can manage seasonal prices of own rooms"
  ON room_seasonal_prices FOR ALL
  USING (room_id IN (
    SELECT r.id FROM rooms r
    JOIN homestays h ON r.homestay_id = h.id
    JOIN hosts ho ON h.host_id = ho.id
    WHERE ho.user_id = auth.uid()
  ));
