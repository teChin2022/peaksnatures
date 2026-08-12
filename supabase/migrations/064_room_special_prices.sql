-- ============================================================
-- ROOM SPECIAL PRICES (weekday + specific-date surcharges per room)
-- A third pricing tier above seasonal ranges. Hosts kept asking for
-- pricing that follows the calendar weekday ("every weekend costs more"),
-- which previously meant hand-creating a two-day season for every
-- weekend of the year.
--
-- Two rule shapes, discriminated by rule_type:
--   'weekday' — weekdays[] (0=Sun … 6=Sat), with an OPTIONAL start/end
--               window. No window means the rule runs forever; a window
--               scopes it to e.g. "every Sat+Sun in November".
--   'date'    — an explicit list of dates.
--
-- The amount is a SURCHARGE, not a replacement price: it is added to
-- whichever tier sits under that night — the seasonal price where a
-- season covers it, otherwise rooms.price_per_night. Hosts think of
-- special days as costing MORE, and a surcharge tracks a seasonal price
-- that differs month to month without being re-entered per season.
--
-- Only ONE rule applies per night — the most specific one, ranked in
-- src/lib/calculate-price.ts (that ranking is the authority, not row
-- order). Surcharges deliberately do not stack: compounding them is
-- not something a host can predict.
--
-- Deliberately NO overlap-exclusion constraint: overlap is inherent
-- (25 Dec is also a Thursday) and is resolved by precedence rather than
-- forbidden, unlike room_seasonal_prices where the dashboard blocks it.
-- Mirrors the room_guest_pricing table + RLS pattern.
-- ============================================================
CREATE TABLE room_special_prices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('weekday', 'date')),
  weekdays SMALLINT[] NOT NULL DEFAULT '{}',
  dates DATE[] NOT NULL DEFAULT '{}',
  start_date DATE,
  end_date DATE,
  surcharge INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'system',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NOT NULL DEFAULT 'system',
  CONSTRAINT check_special_window
    CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date),
  CONSTRAINT check_special_payload CHECK (
    (rule_type = 'weekday' AND array_length(weekdays, 1) > 0) OR
    (rule_type = 'date'    AND array_length(dates, 1) > 0)
  )
);

COMMENT ON COLUMN room_special_prices.weekdays IS
  '0=Sunday … 6=Saturday, matching JS Date.getDay(). Empty for rule_type=''date''.';
COMMENT ON COLUMN room_special_prices.start_date IS
  'Optional window start for weekday rules. NULL means unbounded on this side.';
COMMENT ON COLUMN room_special_prices.surcharge IS
  'THB added per night on top of the seasonal price (or the room base price when no season covers the night). NOT a replacement price.';

CREATE INDEX idx_room_special_prices_room_id ON room_special_prices(room_id);

CREATE TRIGGER trg_room_special_prices_updated_at
  BEFORE UPDATE ON room_special_prices FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Room Special Prices RLS
ALTER TABLE room_special_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view room special prices"
  ON room_special_prices FOR SELECT
  USING (true);

CREATE POLICY "Hosts can manage special prices of own rooms"
  ON room_special_prices FOR ALL
  USING (room_id IN (
    SELECT r.id FROM rooms r
    JOIN homestays h ON r.homestay_id = h.id
    JOIN hosts ho ON h.host_id = ho.id
    WHERE ho.user_id = auth.uid()
  ));
