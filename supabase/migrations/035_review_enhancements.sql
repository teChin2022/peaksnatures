-- ============================================================
-- REVIEW ENHANCEMENTS: category ratings, photos, tags, etc.
-- ============================================================

-- New columns on reviews table
ALTER TABLE reviews
  ADD COLUMN topic TEXT,
  ADD COLUMN rating_environment INTEGER CHECK (rating_environment >= 1 AND rating_environment <= 5),
  ADD COLUMN rating_cleanliness INTEGER CHECK (rating_cleanliness >= 1 AND rating_cleanliness <= 5),
  ADD COLUMN rating_service INTEGER CHECK (rating_service >= 1 AND rating_service <= 5),
  ADD COLUMN rating_value INTEGER CHECK (rating_value >= 1 AND rating_value <= 5),
  ADD COLUMN photos TEXT[] DEFAULT '{}',
  ADD COLUMN impression_tags TEXT[] DEFAULT '{}',
  ADD COLUMN would_return TEXT CHECK (would_return IN ('yes', 'maybe', 'no')),
  ADD COLUMN stay_highlight TEXT;

-- Storage bucket for review photos (public read)
INSERT INTO storage.buckets (id, name, public)
VALUES ('review-photos', 'review-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can view review photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'review-photos');

CREATE POLICY "Anyone can upload review photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'review-photos');
