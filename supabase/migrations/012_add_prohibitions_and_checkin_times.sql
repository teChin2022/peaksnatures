-- Add prohibitions array and check-in/check-out time fields to homestays
ALTER TABLE homestays
  ADD COLUMN IF NOT EXISTS prohibitions text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS check_in_time text DEFAULT '14:00',
  ADD COLUMN IF NOT EXISTS check_out_time text DEFAULT '11:00';
