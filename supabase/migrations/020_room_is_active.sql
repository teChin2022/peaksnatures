-- Add is_active column to rooms table so hosts can activate/deactivate individual rooms
ALTER TABLE rooms ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;
