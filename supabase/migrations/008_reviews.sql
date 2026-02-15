-- ============================================================
-- REVIEWS
-- ============================================================
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  homestay_id UUID NOT NULL REFERENCES homestays(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  guest_name TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(booking_id)
);

CREATE INDEX idx_reviews_homestay_id ON reviews(homestay_id);

-- RLS
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- Anyone can view reviews (public)
CREATE POLICY "Anyone can view reviews"
  ON reviews FOR SELECT
  USING (true);

-- Hosts can manage reviews for their homestays (moderation)
CREATE POLICY "Hosts can manage reviews for their homestays"
  ON reviews FOR ALL
  USING (homestay_id IN (
    SELECT h.id FROM homestays h
    JOIN hosts ho ON h.host_id = ho.id
    WHERE ho.user_id = auth.uid()
  ));
