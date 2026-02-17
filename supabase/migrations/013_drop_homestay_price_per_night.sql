-- Drop the redundant price_per_night column from homestays.
-- Pricing is managed at the room level (rooms.price_per_night).
ALTER TABLE homestays DROP COLUMN IF EXISTS price_per_night;
