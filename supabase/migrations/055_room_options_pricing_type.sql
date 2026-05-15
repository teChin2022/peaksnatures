-- ============================================================
-- ROOM OPTIONS: add pricing_type (per_night | per_time)
-- ============================================================
-- Per-night options charge price × nights (existing behavior).
-- Per-time options charge a single flat fee per booking.
-- Existing rows backfill to 'per_night' via the column default.

ALTER TABLE room_options
  ADD COLUMN pricing_type TEXT NOT NULL DEFAULT 'per_night'
  CHECK (pricing_type IN ('per_night', 'per_time'));
